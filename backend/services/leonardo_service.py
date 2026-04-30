import asyncio
import json
import mimetypes
import os
import tempfile
import time
import traceback
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException


BASE_URL = "https://cloud.leonardo.ai/api/rest/v1"

API_KEY = os.getenv("LEONARDO_API_KEY")
BLUEPRINT_VERSION_ID = os.getenv("LEONARDO_BLUEPRINT_VERSION_ID")

PERSON_NODE_ID = os.getenv("LEONARDO_PERSON_NODE_ID")
PANTS_NODE_ID = os.getenv("LEONARDO_PANTS_NODE_ID")
SHIRT_NODE_ID = os.getenv("LEONARDO_SHIRT_NODE_ID")
SHOES_NODE_ID = os.getenv("LEONARDO_SHOES_NODE_ID")
HAT_NODE_ID = os.getenv("LEONARDO_HAT_NODE_ID")

PUBLIC_OUTPUT = os.getenv("LEONARDO_PUBLIC_OUTPUT", "false").lower() == "true"

JSON_HEADERS = {
    "accept": "application/json",
    "content-type": "application/json",
    "authorization": f"Bearer {API_KEY}",
}

AUTH_HEADERS = {
    "accept": "application/json",
    "authorization": f"Bearer {API_KEY}",
}


def _ensure_config() -> None:
    required = {
        "LEONARDO_API_KEY": API_KEY,
        "LEONARDO_BLUEPRINT_VERSION_ID": BLUEPRINT_VERSION_ID,
        "LEONARDO_PERSON_NODE_ID": PERSON_NODE_ID,
        "LEONARDO_PANTS_NODE_ID": PANTS_NODE_ID,
        "LEONARDO_SHIRT_NODE_ID": SHIRT_NODE_ID,
        "LEONARDO_SHOES_NODE_ID": SHOES_NODE_ID,
        "LEONARDO_HAT_NODE_ID": HAT_NODE_ID,
    }
    missing = [key for key, value in required.items() if not value]
    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"Missing Leonardo configuration: {', '.join(missing)}",
        )


async def upload_init_image(local_file: str) -> str:
    try:
        _ensure_config()

        path = Path(local_file)
        if not path.exists():
            raise HTTPException(status_code=500, detail=f"File does not exist: {local_file}")

        ext = path.suffix.lower().replace(".", "")
        if ext == "jpg":
            ext = "jpeg"

        async with httpx.AsyncClient(timeout=60.0) as client:
            init_resp = await client.post(
                f"{BASE_URL}/init-image",
                headers=JSON_HEADERS,
                json={"extension": ext},
            )
            print("INIT STATUS:", init_resp.status_code)
            print("INIT TEXT:", init_resp.text)
            init_resp.raise_for_status()
            init_data = init_resp.json()

        print("INIT DATA TYPE:", type(init_data))
        print("INIT DATA:", init_data)

        upload_info = init_data["uploadInitImage"]
        upload_url = upload_info["url"]
        fields = upload_info["fields"]

        if isinstance(fields, str):
            fields = json.loads(fields)

        mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"

        with open(path, "rb") as f:
            files = {"file": (path.name, f, mime_type)}
            async with httpx.AsyncClient(timeout=120.0) as client:
                s3_resp = await client.post(upload_url, data=fields, files=files)
                print("S3 STATUS:", s3_resp.status_code)
                print("S3 TEXT:", s3_resp.text[:500])
                s3_resp.raise_for_status()

        key = upload_info["key"]
        return f"https://cdn.leonardo.ai/{key}"
    except Exception:
        traceback.print_exc()
        raise


async def download_remote_image_to_tempfile(image_url: str) -> str:
    suffix = Path(urlparse(image_url).path).suffix or ".png"

    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        resp = await client.get(image_url)
        resp.raise_for_status()
        content = resp.content

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        return temp_file.name


async def upload_remote_image(image_url: str) -> str:
    temp_path = await download_remote_image_to_tempfile(image_url)
    try:
        return await upload_init_image(temp_path)
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


async def execute_blueprint(node_inputs: list[dict]) -> str:
    _ensure_config()

    payload = {
        "blueprintVersionId": BLUEPRINT_VERSION_ID,
        "input": {
            "nodeInputs": node_inputs,
            "public": PUBLIC_OUTPUT,
        },
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{BASE_URL}/blueprint-executions",
            headers=JSON_HEADERS,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    if isinstance(data, list):
        first_error = data[0] if data else {}
        message = first_error.get("message", "Leonardo blueprint execution failed")
        details = first_error.get("extensions", {}).get("details", [])
        if details:
            detail_text = "; ".join(
                f"{d.get('nodeId')}: {d.get('message')}" for d in details
            )
            raise HTTPException(status_code=400, detail=f"{message}: {detail_text}")
        raise HTTPException(status_code=400, detail=message)

    return data["executeBlueprint"]["akUUID"]


async def wait_for_generation_id(execution_id: str, timeout_seconds: int = 600) -> str:
    try:
        _ensure_config()
        url = f"{BASE_URL}/blueprint-executions/{execution_id}/generations"
        start = time.time()

        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                elapsed = time.time() - start
                if elapsed > timeout_seconds:
                    raise HTTPException(status_code=504, detail="Leonardo generation timed out")

                resp = await client.get(url, headers=AUTH_HEADERS)
                print("POLL STATUS:", resp.status_code)
                print("POLL TEXT:", resp.text)
                resp.raise_for_status()
                data = resp.json()

                print("POLL DATA TYPE:", type(data))
                print("POLL DATA:", data)

                edges = data.get("blueprintExecutionGenerations", {}).get("edges", [])
                if edges:
                    for edge in edges:
                        node = edge.get("node", {})
                        status = node.get("status")
                        generation_id = node.get("generationId")
                        failed_reason = node.get("failedReason")

                        if status == "COMPLETED" and generation_id:
                            return generation_id

                        if status == "FAILED":
                            raise HTTPException(
                                status_code=502,
                                detail=f"Leonardo generation failed: {failed_reason or 'Unknown error'}",
                            )

                await asyncio.sleep(1)
    except Exception:
        traceback.print_exc()
        raise


async def get_generated_image_url(generation_id: str) -> str:
    try:
        _ensure_config()

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(
                f"{BASE_URL}/generations/{generation_id}",
                headers=AUTH_HEADERS,
            )
            print("GENERATION STATUS:", resp.status_code)
            print("GENERATION TEXT:", resp.text)
            resp.raise_for_status()
            data = resp.json()

        print("GENERATION DATA TYPE:", type(data))
        print("GENERATION DATA:", data)

        root = data.get("generations_by_pk", data)
        images = root.get("generated_images", [])
        if not images:
            raise HTTPException(status_code=502, detail="Leonardo returned no generated images")

        return images[0]["url"]
    except Exception:
        traceback.print_exc()
        raise


async def download_image(image_url: str) -> str:
    suffix = Path(urlparse(image_url).path).suffix or ".png"

    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        resp = await client.get(image_url)
        resp.raise_for_status()
        content = resp.content

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        return temp_file.name
