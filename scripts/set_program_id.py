#!/usr/bin/env python3
"""Patch the public RLYA program ID into Anchor.toml and declare_id!.

Use only a PUBLIC Solana address. This script never reads a private key.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58decode(value: str) -> bytes:
    n = 0
    for ch in value:
        if ch not in ALPHABET:
            raise ValueError("invalid base58 character")
        n = n * 58 + ALPHABET.index(ch)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    pad = len(value) - len(value.lstrip("1"))
    return b"\0" * pad + raw


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/set_program_id.py <PUBLIC_PROGRAM_ID>")
    program_id = sys.argv[1].strip()
    try:
        decoded = b58decode(program_id)
    except ValueError as exc:
        raise SystemExit(f"Invalid Solana program ID: {exc}")
    if len(decoded) != 32:
        raise SystemExit("Invalid Solana program ID: decoded key must be 32 bytes")

    lib = ROOT / "programs/rlya_sale/src/lib.rs"
    source = lib.read_text()
    source, count = re.subn(r'declare_id!\("[1-9A-HJ-NP-Za-km-z]+"\);', f'declare_id!("{program_id}");', source, count=1)
    if count != 1:
        raise SystemExit("Could not locate exactly one declare_id! in rlya_sale")
    lib.write_text(source)

    anchor = ROOT / "Anchor.toml"
    text = anchor.read_text()
    text, count = re.subn(r'(rlya_sale\s*=\s*")[1-9A-HJ-NP-Za-km-z]+(")', rf'\g<1>{program_id}\2', text)
    if count < 1:
        raise SystemExit("Could not locate rlya_sale program IDs in Anchor.toml")
    anchor.write_text(text)

    print(f"RALYA program ID set to {program_id}")
    print("Only the public address was written. No private key was read or stored.")


if __name__ == "__main__":
    main()
