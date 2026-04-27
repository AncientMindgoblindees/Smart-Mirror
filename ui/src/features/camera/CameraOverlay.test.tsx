import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CameraOverlay } from './CameraOverlay';


describe('CameraOverlay', () => {
  it('renders the preview hint and exit button', () => {
    const onClose = vi.fn();

    render(<CameraOverlay onClose={onClose} />);

    expect(screen.getByText('Native camera preview is running.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /exit camera/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows an error banner when the camera is unavailable', () => {
    render(<CameraOverlay onClose={() => {}} errorMessage="Camera busy" />);

    expect(screen.getByText('Mirror camera unavailable.')).toBeInTheDocument();
    expect(screen.getByText('Camera busy')).toBeInTheDocument();
  });
});

