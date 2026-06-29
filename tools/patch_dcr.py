#!/usr/bin/env python3
"""Patch a Director afterburner .dcr file's MCsL chunk to replace
``empty.cst`` placeholder cast paths with unique per-cast filenames.

This is needed because the original Ben 10 game stores all external
cast filenames as 'empty.cst' and relies on runtime Lingo to rewrite
them — which DirPlayer's emulator doesn't currently re-trigger.

The checked-in ``game/game.dcr`` is already patched. Running this tool
against it validates the 24 names and exits successfully without rewriting
the binary. Pass an original DCR and optionally ``--output`` to create a
patched copy.
"""

import argparse
import shutil
import struct
import zlib
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "game" / "game.dcr"

# Ordered cast lib names matching the 24 'empty.cst' occurrences in MCsL.
# Derived from MCsL inspection — first 19 are char_*, then game, then 4 maps.
CAST_ORDER = [
    "char_Ben", "char_FourArms", "char_Graymatter", "char_Diamondhead",
    "char_Ghostfreak", "char_Heatblast", "char_Ripjaw", "char_Stinkfly",
    "char_Upgrade", "char_XLR8", "char_Wildmutt", "char_Bugbot",
    "char_Nosebot", "char_LargeBugbot", "char_Minion1", "char_Minion2",
    "char_Mechbot", "char_FlyingMechbot", "char_Boss",
    "game",
    "map_Factory", "map_Micro", "map_Rafters", "map_Sewer",
]
# Patched filenames must be exactly the same length as "empty.cst" (9 bytes)
# so the MCsL chunk's byte offsets don't shift. Use emp01.cst..emp24.cst.
PATCHED_NAMES = [f"emp{i:02d}.cst" for i in range(1, 25)]
if not all(len(name) == 9 for name in PATCHED_NAMES):
    raise RuntimeError("Patched cast names must remain nine bytes long")
if len(PATCHED_NAMES) != len(CAST_ORDER) or len(CAST_ORDER) != 24:
    raise RuntimeError("The patched-name and cast-library tables must contain 24 entries")


def require(condition, message):
    """Raise a useful error even when Python assertions are disabled."""
    if not condition:
        raise ValueError(message)


def read_varint(buf, pos):
    """Read a bounded Director varint and return ``(value, next_position)``."""
    require(
        0 <= pos <= len(buf),
        f"Varint offset {pos} is outside a {len(buf)}-byte buffer",
    )
    val = 0
    for _ in range(10):
        require(pos < len(buf), "Truncated varint")
        b = buf[pos]
        pos += 1
        val = (val << 7) | (b & 0x7F)
        if (b & 0x80) == 0:
            return val, pos
    raise ValueError("Varint exceeds the supported 10-byte limit")


def write_varint(val):
    """Write a big-endian-style varint (MSB groups first, high bit = continue)."""
    require(
        isinstance(val, int) and val >= 0,
        f"Cannot encode negative varint {val!r}",
    )
    if val == 0:
        return bytes([0])
    parts = []
    while val:
        parts.append(val & 0x7F)
        val >>= 7
    parts.reverse()
    out = bytearray()
    for i, p in enumerate(parts):
        if i < len(parts) - 1:
            out.append(p | 0x80)
        else:
            out.append(p)
    return bytes(out)


def find_all(buf, needle):
    """Return every non-overlapping occurrence of ``needle`` in ``buf``."""
    positions = []
    pos = 0
    while True:
        pos = buf.find(needle, pos)
        if pos < 0:
            return positions
        positions.append(pos)
        pos += len(needle)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "input",
        nargs="?",
        type=Path,
        default=DEFAULT_INPUT,
        help="DCR to inspect or patch (default: game/game.dcr)",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="output path (default for an unpatched input: <input>.patched.dcr)",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    input_path = args.input.expanduser().resolve()
    output_path = args.output.expanduser().resolve() if args.output else None
    data = input_path.read_bytes()

    # XFIR header
    require(len(data) >= 12, f"{input_path} is too short to be a Director file")
    require(data[:4] == b"XFIR", f"{input_path} does not start with an XFIR header")
    declared_size = struct.unpack_from("<I", data, 4)[0]
    require(
        declared_size == len(data) - 8,
        f"XFIR size field is {declared_size}, expected {len(data) - 8}",
    )
    subtype = data[8:12]
    require(subtype == b"MDGF", f"Unsupported Director subtype {subtype!r}; expected MDGF")

    pos = 12
    # Fver
    fver_tag = data[pos:pos+4]; pos += 4
    fver_len, pos = read_varint(data, pos)
    fver_payload = data[pos:pos+fver_len]; pos += fver_len
    require(fver_tag == b"revF", f"Expected Fver chunk, found {fver_tag!r}")
    # Fcdr
    fcdr_tag = data[pos:pos+4]; pos += 4
    fcdr_len, pos = read_varint(data, pos)
    fcdr_payload = data[pos:pos+fcdr_len]; pos += fcdr_len
    require(fcdr_tag == b"rdcF", f"Expected Fcdr chunk, found {fcdr_tag!r}")
    # ABMP
    abmp_tag = data[pos:pos+4]; pos += 4
    abmp_length, pos = read_varint(data, pos)
    abmp_end = pos + abmp_length
    abmp_ct, pos = read_varint(data, pos)
    abmp_ul, pos = read_varint(data, pos)
    require(abmp_tag == b"PMBA", f"Expected ABMP chunk, found {abmp_tag!r}")
    require(abmp_end <= len(data), "ABMP chunk extends beyond the input file")
    abmp_uncomp = zlib.decompress(data[pos:abmp_end])
    require(
        len(abmp_uncomp) == abmp_ul,
        "ABMP uncompressed size does not match its header",
    )
    pos = abmp_end
    # FGEI
    fgei_tag = data[pos:pos+4]; pos += 4
    ils_unk, pos = read_varint(data, pos)
    ils_body_offset = pos
    require(fgei_tag == b"IEGF", f"Expected FGEI chunk, found {fgei_tag!r}")
    # ILS chunk_info is in ABMP — read it out
    ap = 0
    _u1, ap = read_varint(abmp_uncomp, ap)
    _u2, ap = read_varint(abmp_uncomp, ap)
    res_count, ap = read_varint(abmp_uncomp, ap)
    abmp_entries_start = ap
    chunks = {}
    chunk_order = []
    for i in range(res_count):
        e_start = ap
        rid, ap = read_varint(abmp_uncomp, ap)
        off, ap = read_varint(abmp_uncomp, ap)
        cs, ap = read_varint(abmp_uncomp, ap)
        us, ap = read_varint(abmp_uncomp, ap)
        ct, ap = read_varint(abmp_uncomp, ap)
        tag = abmp_uncomp[ap:ap+4][::-1].decode("ascii", "replace")
        ap += 4
        chunks[rid] = {
            "tag": tag, "offset": off, "comp_size": cs,
            "uncomp_size": us, "comp_type": ct,
            "entry_start": e_start, "entry_end": ap,
        }
        chunk_order.append(rid)

    require(
        2 in chunks,
        "ABMP does not contain the initial-load-segment entry (resource 2)",
    )
    ils_info = chunks[2]
    print(f"ILS comp_size={ils_info['comp_size']} uncomp_size={ils_info['uncomp_size']}")

    # Read and decompress ILS body
    ils_zlib = data[ils_body_offset:ils_body_offset+ils_info["comp_size"]]
    ils_uncomp = zlib.decompress(ils_zlib)
    require(
        len(ils_uncomp) == ils_info["uncomp_size"],
        "ILS uncompressed size does not match its ABMP entry",
    )
    ils_after_pos = ils_body_offset + ils_info["comp_size"]

    # Within ILS uncomp, locate MCsL chunk
    ip = 0
    mcsl_start = None
    mcsl_end = None
    while ip < len(ils_uncomp):
        rid, ip = read_varint(ils_uncomp, ip)
        info = chunks.get(rid)
        if not info:
            break
        clen = info["comp_size"]
        if info["tag"] == "MCsL" and rid == 53799:
            mcsl_start = ip
            mcsl_end = ip + clen
            break
        ip += clen
    require(mcsl_start is not None, "Could not locate MCsL resource 53799 in the ILS")
    mcsl_bytes = bytearray(ils_uncomp[mcsl_start:mcsl_end])
    print(f"MCsL @ ILS offset {mcsl_start}, length {len(mcsl_bytes)}")

    # Patch the 24 'empty.cst' occurrences with unique 9-char names. The
    # repository stores the patched file, so explicitly recognize that state
    # instead of treating a second run as corruption.
    occurrences = find_all(mcsl_bytes, b"empty.cst")
    patched_positions = [
        find_all(mcsl_bytes, name.encode("ascii")) for name in PATCHED_NAMES
    ]
    is_patched = (
        not occurrences
        and all(len(positions) == 1 for positions in patched_positions)
        and [positions[0] for positions in patched_positions]
        == sorted(positions[0] for positions in patched_positions)
    )

    if is_patched:
        print("Already patched: all 24 empNN.cst cast names are present in order.")
        if output_path is not None and output_path != input_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(input_path, output_path)
            print(f"Copied validated DCR to {output_path}")
        return

    found_patched = sum(len(positions) for positions in patched_positions)
    require(
        len(occurrences) == 24 and found_patched == 0,
        "MCsL cast paths are neither clean nor fully patched "
        f"(empty.cst={len(occurrences)}, empNN.cst={found_patched})",
    )

    for i, off in enumerate(occurrences):
        new_name = PATCHED_NAMES[i].encode("ascii")
        mcsl_bytes[off:off+9] = new_name
        print(f"  [{i}] @ MCsL[{off}]: emp{i+1:02d}.cst → {CAST_ORDER[i]}.cct")

    # Splice back into ILS uncomp
    new_ils_uncomp = (
        ils_uncomp[:mcsl_start] + bytes(mcsl_bytes) + ils_uncomp[mcsl_end:]
    )
    require(len(new_ils_uncomp) == len(ils_uncomp), "ILS length must remain identical")

    # Re-compress ILS body, matching the original compression level if we can.
    # Try multiple levels and pick the one that gives the same or smaller size.
    best_zlib = None
    for level in (9, 8, 7, 6, 5, 4, 3, 2, 1):
        candidate = zlib.compress(new_ils_uncomp, level)
        if best_zlib is None or len(candidate) < len(best_zlib):
            best_zlib = candidate

    print(f"Original ILS zlib: {len(ils_zlib)} bytes")
    print(f"New ILS zlib (best): {len(best_zlib)} bytes")

    if len(best_zlib) > len(ils_zlib):
        # We need to shift everything after ILS forward. Update ABMP offsets.
        print(
            f"ILS grew by {len(best_zlib) - len(ils_zlib)} bytes "
            "— will shift trailing chunks"
        )
        size_delta = len(best_zlib) - len(ils_zlib)
    elif len(best_zlib) < len(ils_zlib):
        # Pad ILS to keep file layout. Append a deflate uncompressed block of zeros?
        # Easier: shift trailing chunks BACKWARDS (negative delta)
        print(
            f"ILS shrank by {len(ils_zlib) - len(best_zlib)} bytes "
            "— will shift trailing chunks back"
        )
        size_delta = len(best_zlib) - len(ils_zlib)
    else:
        size_delta = 0

    # Update ABMP entry for chunk 2 (ILS): comp_size changes
    # We need to rewrite the ABMP varints for this entry
    # ILS entry: rid=2, off=0, comp_size=X, uncomp_size=Y, comp_type=Z, tag(4)
    new_ils_comp_size = len(best_zlib)

    # Build new ABMP body
    new_abmp_body = bytearray()
    new_abmp_body += abmp_uncomp[:abmp_entries_start]  # header varints

    # Track post-ILS chunks: their FGEI offsets need adjusting by size_delta
    for rid in chunk_order:
        info = chunks[rid]
        cs = info["comp_size"]
        if rid == 2:
            cs = new_ils_comp_size
        off = info["offset"]
        # If offset is not 0xFFFFFFFF (in-ILS) and >= old ils end, shift
        if off != 0xFFFFFFFF and off >= ils_info["comp_size"]:
            off = off + size_delta
        new_abmp_body += write_varint(rid)
        new_abmp_body += write_varint(off)
        new_abmp_body += write_varint(cs)
        new_abmp_body += write_varint(info["uncomp_size"])
        new_abmp_body += write_varint(info["comp_type"])
        # tag is 4 bytes (little-endian — reversed from human-readable)
        tag_bytes = info["tag"].encode("ascii")[::-1]
        if len(tag_bytes) != 4:
            tag_bytes = tag_bytes.ljust(4, b" ")
        new_abmp_body += tag_bytes

    # Re-compress ABMP body
    new_abmp_zlib = zlib.compress(bytes(new_abmp_body), 9)
    new_abmp_uncomp_len = len(new_abmp_body)

    # Now compute the new ABMP chunk size:
    # ABMP body in file: <length_varint><ct_varint><uncomp_len_varint><zlib data>
    # We need to write these AFTER the ABMP tag.
    # The length is the BYTES OF: ct_varint + uncomp_len_varint + zlib_data
    # i.e. abmp_length = len(write_varint(comp_type)) + len(write_varint(uncomp_len)) + len(zlib_data)
    new_abmp_ct_v = write_varint(abmp_ct)  # keep same compression type
    new_abmp_ul_v = write_varint(new_abmp_uncomp_len)
    new_abmp_inner_size = (
        len(new_abmp_ct_v) + len(new_abmp_ul_v) + len(new_abmp_zlib)
    )
    new_abmp_length_v = write_varint(new_abmp_inner_size)

    # Assemble new file
    out = bytearray()
    # XFIR header — recompute final size
    out += b"XFIR"
    out += b"\x00\x00\x00\x00"  # placeholder for size
    out += b"MDGF"
    # Fver
    out += fver_tag
    out += write_varint(fver_len)
    out += fver_payload
    # Fcdr
    out += fcdr_tag
    out += write_varint(fcdr_len)
    out += fcdr_payload
    # ABMP
    out += abmp_tag
    out += new_abmp_length_v
    out += new_abmp_ct_v
    out += new_abmp_ul_v
    out += new_abmp_zlib
    # FGEI tag + ils_unk varint
    out += fgei_tag
    out += write_varint(ils_unk)
    # New ILS body
    out += best_zlib
    # Rest of FGEI body (chunks after ILS) — copy verbatim from input
    out += data[ils_after_pos:]

    # Update XFIR size field (size of file excluding 'XFIR' and the size word itself = total - 8)
    total_size = len(out)
    struct.pack_into("<I", out, 4, total_size - 8)

    if output_path is None:
        output_path = input_path.with_name(f"{input_path.stem}.patched{input_path.suffix}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(out)
    print(f"\nWrote {output_path}: {total_size} bytes (was {len(data)})")


if __name__ == "__main__":
    main()
