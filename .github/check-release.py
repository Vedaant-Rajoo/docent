"""Check release packaging and mocked publishing: python3 .github/check-release.py."""

import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile
import textwrap
import zipfile

workflow = Path(__file__).with_name("workflows") / "release.yml"
source = workflow.read_text()


def step(name):
    # ponytail: These are literal run blocks; use a YAML parser if the workflow gains anchors.
    block = source.split(f"      - name: {name}\n", 1)[1].split("\n      - ", 1)[0]
    command = textwrap.dedent(block.split("        run: |\n", 1)[1])
    return command


command = step("Run Store operation")
validate = step("Validate release")
attach = step("Attach release ZIP")
arguments = shlex.split(step("Package ZIP").replace("\\\n", " "))
with tempfile.TemporaryDirectory(prefix="docent-package-check-") as directory:
    root = Path(directory)
    for name in arguments[5:]:
        original = workflow.resolve().parents[2] / name
        if original.is_dir():
            shutil.copytree(original, root / name)
        else:
            shutil.copy2(original, root / name)

    def git(*arguments):
        subprocess.run(["git", "-c", "user.name=Release check",
                        "-c", "user.email=release-check@example.invalid", "-c", "commit.gpgsign=false",
                        *arguments], cwd=root, check=True)

    git("init", "--quiet", "--initial-branch=main")
    git("add", ".")
    git("commit", "--quiet", "-m", "Package check")
    git("update-ref", "refs/remotes/origin/main", "HEAD")
    subprocess.run(arguments, cwd=root, check=True)
    archive = (root / "docent.zip").read_bytes()
    subprocess.run(arguments, cwd=root, check=True)
    assert (root / "docent.zip").read_bytes() == archive, "ZIP must be reproducible for retries"
    with zipfile.ZipFile(root / "docent.zip") as package:
        assert package.testzip() is None
        manifest = json.loads(package.read("manifest.json"))
        version = manifest["version"]
        assert re.fullmatch(r"(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,3}", version), "Invalid Chrome version"
        assert all(int(part) <= 65535 for part in version.split(".")) and any(int(part) for part in version.split("."))
        resources = [manifest["background"]["service_worker"], manifest["options_ui"]["page"],
                     *manifest["icons"].values(), "settings.js", "LICENSE"]
        for script in manifest["content_scripts"]:
            resources.extend(script.get("js", []) + script.get("css", []))
        assert set(resources) <= set(package.namelist()), "ZIP is missing manifest resources"

    for tag, success in [(f"v{version}", True), (f"v{version}.invalid", False), ("v0.1.0;touch injected", False)]:
        result = subprocess.run(["bash", "-c", validate], cwd=root, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            env={**os.environ, "RELEASE_TAG": tag})
        assert (result.returncode == 0) == success, result.stdout
    assert not (root / "injected").exists()
    (root / "unreviewed").write_text("This commit is not on origin/main.")
    git("add", "unreviewed")
    git("commit", "--quiet", "-m", "Unreviewed commit")
    result = subprocess.run(["bash", "-c", validate], cwd=root, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        env={**os.environ, "RELEASE_TAG": f"v{version}"})
    assert result.returncode != 0 and "must belong to main" in result.stdout, result.stdout

asset_mock = r'''
gh() {
  echo "$1 $2" >> "$MOCK_DIR/calls"
  case "$1 $2" in
    'release view')
      case "$MOCK_EXISTING" in
        no) printf '{"assets":[]}' ;;
        error) return 1 ;;
        *) printf '{"assets":[{"name":"docent.zip"}]}' ;;
      esac ;;
    'release download') cp "$MOCK_DIR/existing.zip" "${@: -1}/docent.zip" ;;
    'release upload') return 0 ;;
    *) return 1 ;;
  esac
}
mktemp() { mkdir -p "$MOCK_DIR/download"; printf '%s' "$MOCK_DIR/download"; }
'''

for existing, success, calls in [
    ("no", True, ["release view", "release upload"]),
    ("same", True, ["release view", "release download"]),
    ("different", False, ["release view", "release download"]),
    ("error", False, ["release view"]),
]:
    with tempfile.TemporaryDirectory(prefix="docent-asset-check-") as directory:
        root = Path(directory)
        (root / "docent.zip").write_bytes(archive)
        previous = archive if existing == "same" else b"Existing asset must not be replaced."
        (root / "existing.zip").write_bytes(previous)
        result = subprocess.run(["bash", "-c", asset_mock + attach], cwd=root, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=10,
            env={**os.environ, "RELEASE_TAG": "v0.1.0", "GITHUB_REPOSITORY": "test/test",
                 "MOCK_DIR": directory, "MOCK_EXISTING": existing})
        assert (result.returncode == 0) == success, result.stdout
        assert (root / "calls").read_text().splitlines() == calls, result.stdout
        assert (root / "existing.zip").read_bytes() == previous

mock = r'''
curl() {
  case "${@: -1}" in
    *:fetchStatus)
      echo status >> "$MOCK_DIR/calls"
      if [ -f "$MOCK_DIR/uploaded" ]; then
        printf '{"lastAsyncUploadState":"%s"}' "$MOCK_PROCESSED"
      else
        printf '{"submittedItemRevisionStatus":{"state":"%s"}}' "$MOCK_REVISION"
      fi ;;
    *:upload)
      echo upload >> "$MOCK_DIR/calls"
      touch "$MOCK_DIR/uploaded"
      if [ "$MOCK_UPLOAD" = HTTP_ERROR ]; then return 22; fi
      printf '{"uploadState":"%s"}' "$MOCK_UPLOAD" ;;
    *:publish)
      echo publish >> "$MOCK_DIR/calls"
      printf '{"state":"%s"}' "$MOCK_PUBLISH" ;;
    *) return 1 ;;
  esac
}
sleep() { :; }
'''

# operation, existing revision, upload response, processed state, publish response, success, calls
cases = [
    ("invalid", "", "SUCCEEDED", "SUCCEEDED", "PENDING_REVIEW", False, []),
    ("status", "PENDING_REVIEW", "SUCCEEDED", "SUCCEEDED", "PENDING_REVIEW", True, ["status"]),
    ("upload", "PENDING_REVIEW", "SUCCEEDED", "SUCCEEDED", "PENDING_REVIEW", False, ["status"]),
    ("publish", "STAGED", "SUCCEEDED", "SUCCEEDED", "PENDING_REVIEW", False, ["status"]),
    ("upload", "", "SUCCEEDED", "SUCCEEDED", "PENDING_REVIEW", True, ["status", "upload"]),
    ("publish", "", "FAILED", "SUCCEEDED", "PENDING_REVIEW", False, ["status", "upload"]),
    ("publish", "", "HTTP_ERROR", "SUCCEEDED", "PENDING_REVIEW", False, ["status", "upload"]),
    ("publish", "", "IN_PROGRESS", "SUCCEEDED", "PENDING_REVIEW", True, ["status", "upload", "status", "publish"]),
    ("publish", "", "IN_PROGRESS", "IN_PROGRESS", "PENDING_REVIEW", False, ["status", "upload"] + ["status"] * 12),
    ("publish", "", "SUCCEEDED", "SUCCEEDED", "REJECTED", False, ["status", "upload", "publish"]),
]

for operation, revision, upload, processed, published, success, calls in cases:
    with tempfile.TemporaryDirectory(prefix="docent-release-check-") as directory:
        result = subprocess.run(["bash", "-c", mock + command], text=True,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=10,
            env={**os.environ, "ACCESS_TOKEN": "test-token", "CWS_ITEM": "publishers/test/items/test",
                "STORE_OPERATION": operation, "MOCK_DIR": directory, "MOCK_REVISION": revision,
                "MOCK_UPLOAD": upload, "MOCK_PROCESSED": processed, "MOCK_PUBLISH": published})
        assert (result.returncode == 0) == success, result.stdout
        recorded = Path(directory) / "calls"
        assert (recorded.read_text().splitlines() if recorded.exists() else []) == calls, result.stdout

print("ok: reproducible ZIP, release validation, asset retries, Store scenarios")
