# Cursor rules in this folder

**What agents actually load:** Cursor picks up rules from **`.mdc`** files here (Markdown plus YAML frontmatter), not from arbitrary `.md` names.

| File | Role |
|------|------|
| `project-rules.mdc` | **Always applied** (`alwaysApply: true`) — every agent and chat session should follow it. |

Add more `.mdc` files for file-specific guidance, for example:

```yaml
---
description: Short summary for the rule picker
globs: "**/*.ts"
alwaysApply: false
---
```

Body: your conventions, examples, and constraints.

See [Cursor: Rules](https://docs.cursor.com/context/rules) for the latest behavior.
