"""Website knowledge: what the portfolio says, kept in the vector store.

The portfolio repo builds a list of entries -- one per page section, project
card, blog post and how-to topic -- and POSTs it to /api/knowledge/sync/ on
every push that changes the site. This module validates that list and brings
the index in line with it.

Embedding is the expensive part (the provider's free tier counts every chunk
against a per-minute quota), so the sync is a diff: each entry carries a hash
of its content, and only entries that are new or changed are embedded again.
An entry that disappeared from the site has its chunks deleted.
"""
import hashlib
import json
import logging
import re

from rag.a_loader import load_entries
from rag.b_splitter import text_splitter
from rag.d_vectorstore import add_documents, delete_knowledge, get_vectorstore, knowledge_hashes

logger = logging.getLogger(__name__)

ENTRY_TYPES = {"site", "blog", "help"}
PAGES = {"home", "blog", "any"}
ACTION_TYPES = {"scroll", "highlight", "open"}
MAX_ENTRIES = 300
MAX_TEXT = 20_000

ID_RE = re.compile(r"^[a-z0-9][a-z0-9:_-]{0,119}$")
SLUG_RE = re.compile(r"^[a-z0-9-]{1,80}$")
# Relative links within the portfolio only: "index.html#projects",
# "blog.html#post-...". Never a scheme, never another host.
URL_RE = re.compile(r"^(index|blog)\.html(#[A-Za-z0-9_-]{1,100})?$")


class InvalidEntries(ValueError):
    pass


def _clean_actions(actions, where):
    if actions is None:
        return []
    if not isinstance(actions, list) or len(actions) > 5:
        raise InvalidEntries(f"{where}: actions must be a list of at most 5.")
    cleaned = []
    for action in actions:
        if not isinstance(action, dict):
            raise InvalidEntries(f"{where}: each action must be an object.")
        kind, target = action.get("type"), action.get("target")
        if kind not in ACTION_TYPES or not isinstance(target, str) or not SLUG_RE.match(target):
            raise InvalidEntries(f"{where}: unknown action {action!r}.")
        cleaned.append({"type": kind, "target": target})
    return cleaned


def clean_entries(payload):
    """Validate a sync payload and return its entries in a canonical form.

    Strict on purpose: everything here ends up in a prompt and in links shown
    to visitors, so anything unexpected is rejected rather than coerced.
    """
    entries = payload.get("entries") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        raise InvalidEntries("Body must be an object with an 'entries' list.")
    if len(entries) > MAX_ENTRIES:
        raise InvalidEntries(f"At most {MAX_ENTRIES} entries per sync.")

    cleaned, seen = [], set()
    for index, entry in enumerate(entries):
        where = f"entries[{index}]"
        if not isinstance(entry, dict):
            raise InvalidEntries(f"{where} must be an object.")
        entry_id = entry.get("id")
        if not isinstance(entry_id, str) or not ID_RE.match(entry_id):
            raise InvalidEntries(f"{where}: invalid id.")
        if entry_id in seen:
            raise InvalidEntries(f"{where}: duplicate id {entry_id}.")
        seen.add(entry_id)

        if entry.get("type") not in ENTRY_TYPES:
            raise InvalidEntries(f"{where}: type must be one of {sorted(ENTRY_TYPES)}.")
        if entry.get("page") not in PAGES:
            raise InvalidEntries(f"{where}: page must be one of {sorted(PAGES)}.")
        section = entry.get("section")
        if not isinstance(section, str) or not SLUG_RE.match(section):
            raise InvalidEntries(f"{where}: invalid section.")
        item = entry.get("item")
        if item is not None and (not isinstance(item, str) or not SLUG_RE.match(item)):
            raise InvalidEntries(f"{where}: invalid item.")
        url = entry.get("url")
        if not isinstance(url, str) or not URL_RE.match(url):
            raise InvalidEntries(f"{where}: url must be index.html or blog.html with an optional #anchor.")
        title = entry.get("title")
        if not isinstance(title, str) or not title.strip() or len(title) > 200:
            raise InvalidEntries(f"{where}: title is required (200 characters at most).")
        body = entry.get("text")
        if not isinstance(body, str) or not body.strip() or len(body) > MAX_TEXT:
            raise InvalidEntries(f"{where}: text is required ({MAX_TEXT} characters at most).")

        clean = {
            "id": entry_id,
            "type": entry["type"],
            "page": entry["page"],
            "section": section,
            "url": url,
            "title": title.strip(),
            "text": body.strip(),
        }
        if item:
            clean["item"] = item
        actions = _clean_actions(entry.get("actions"), where)
        if actions:
            if clean["type"] != "help":
                raise InvalidEntries(f"{where}: only help entries may carry actions.")
            clean["actions"] = actions
        clean["hash"] = entry_hash(clean)
        cleaned.append(clean)
    return cleaned


def entry_hash(entry):
    """A fingerprint of everything that would change what gets indexed."""
    content = {key: value for key, value in entry.items() if key != "hash"}
    return hashlib.sha256(json.dumps(content, sort_keys=True).encode("utf-8")).hexdigest()


def plan_sync(existing, entries):
    """Work out the minimum change.

    existing: {source_id: content_hash} currently indexed.
    Returns a dict of lists: `add` (entries to embed, new or changed),
    `changed` and `gone` (source ids whose old chunks must be deleted), and
    `unchanged` (a count). A changed entry is deleted and then re-added.
    """
    incoming = {entry["id"] for entry in entries}
    to_add = [entry for entry in entries if existing.get(entry["id"]) != entry["hash"]]
    return {
        "add": to_add,
        "changed": sorted(entry["id"] for entry in to_add if entry["id"] in existing),
        "gone": sorted(set(existing) - incoming),
        "unchanged": len(entries) - len(to_add),
    }


def run_sync(entries):
    plan = plan_sync(knowledge_hashes(), entries)
    removed_chunks = delete_knowledge(plan["changed"] + plan["gone"])
    chunks = text_splitter(load_entries(plan["add"])) if plan["add"] else []
    if chunks:
        add_documents(get_vectorstore(), chunks)
    result = {
        "added": len(plan["add"]) - len(plan["changed"]),
        "updated": len(plan["changed"]),
        "removed": len(plan["gone"]),
        "unchanged": plan["unchanged"],
        "chunks_embedded": len(chunks),
        "chunks_deleted": removed_chunks,
    }
    logger.info("Knowledge sync: %s", result)
    return result
