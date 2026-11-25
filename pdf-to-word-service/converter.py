"""Standalone PDF-to-DOCX conversion worker.

The API runs this file in a child process so a slow or stuck conversion can be
killed when it exceeds the time limit. A thread cannot be stopped that way.

Usage: python converter.py SOURCE.pdf TARGET.docx
Exit code 0 on success; on failure the error message is written to stderr.
"""

import sys


def convert_file(source_path: str, output_path: str) -> None:
    from pdf2docx import Converter

    converter = Converter(source_path)
    try:
        converter.convert(output_path, multi_processing=False)
    finally:
        converter.close()


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: converter.py SOURCE.pdf TARGET.docx", file=sys.stderr)
        return 2
    try:
        convert_file(argv[1], argv[2])
    except Exception as exc:  # report any library failure to the parent process
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
