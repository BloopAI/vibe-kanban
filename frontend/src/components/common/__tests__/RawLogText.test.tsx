import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RawLogText from '../RawLogText';

describe('RawLogText', () => {
  it('renders plain text correctly', () => {
    render(<RawLogText content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders as span when specified', () => {
    const { container } = render(
      <RawLogText content="Hello world" as="span" />
    );
    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('applies stderr styling for stderr channel without ANSI', () => {
    const { container } = render(
      <RawLogText content="Error message" channel="stderr" />
    );
    expect(container.firstChild).toHaveClass('text-red-600');
  });

  it('includes ANSI content', () => {
    // Test with ANSI escape sequence for green text
    render(<RawLogText content="\x1B[32mGreen text\x1B[0m" />);
    expect(screen.getByText(/Green text/)).toBeInTheDocument();
  });

  it('preserves whitespace with pre-wrap', () => {
    const { container } = render(<RawLogText content="  Indented text  " />);
    expect(container.firstChild).toHaveClass('whitespace-pre-wrap');
  });

  it('applies custom className', () => {
    const { container } = render(
      <RawLogText content="Test" className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
