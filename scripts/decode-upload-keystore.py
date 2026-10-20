#!/usr/bin/env python3
"""Decode KEYSTORE_BASE64 into KEYSTORE_PATH. Never prints the secret."""
import base64
import os
import pathlib
import sys

raw = os.environ.get("KEYSTORE_BASE64", "")
if not raw.strip():
    sys.stderr.write("KEYSTORE_BASE64 is empty\n")
    sys.exit(1)
try:
    data = base64.b64decode(raw)
except Exception:
    sys.stderr.write("KEYSTORE_BASE64 is not valid base64\n")
    sys.exit(1)
if len(data) < 16:
    sys.stderr.write("Decoded keystore is too small\n")
    sys.exit(1)
path = pathlib.Path(os.environ["KEYSTORE_PATH"])
path.write_bytes(data)
os.chmod(path, 0o600)
print("Decoded upload keystore into RUNNER_TEMP")
