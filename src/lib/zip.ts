// Minimal ZIP writer (store / no compression). PNG and video payloads are
// already compressed, so deflate would only waste CPU. Keeping this local
// avoids adding a dependency to the single-file build.

export interface ZipFile {
  name: string
  data: Blob
}

const encoder = new TextEncoder()

// CRC-32 table, generated once.
const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeHeader(target: DataView, offset: number, value: number) {
  target.setUint16(offset, value & 0xffff, true)
}

function write32(target: DataView, offset: number, value: number) {
  target.setUint32(offset, value >>> 0, true)
}

export async function createZip(files: ZipFile[]): Promise<Blob> {
  const entries = await Promise.all(
    files.map(async (file) => {
      const bytes = new Uint8Array(await file.data.arrayBuffer())
      // DOS date/time: fixed to 1980-01-01 00:00, deterministic and valid.
      return {
        name: encoder.encode(file.name),
        bytes,
        crc: crc32(bytes),
      }
    }),
  )

  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const local = new Uint8Array(30 + entry.name.length)
    const lv = new DataView(local.buffer)
    write32(lv, 0, 0x04034b50) // local file header signature
    writeHeader(lv, 4, 20) // version needed
    writeHeader(lv, 6, 0x0800) // flags: UTF-8 filenames
    writeHeader(lv, 8, 0) // compression: store
    writeHeader(lv, 10, 0) // mod time
    writeHeader(lv, 12, 0x0021) // mod date: 1980-01-01
    write32(lv, 14, entry.crc)
    write32(lv, 18, entry.bytes.length)
    write32(lv, 22, entry.bytes.length)
    writeHeader(lv, 26, entry.name.length)
    writeHeader(lv, 28, 0) // extra length
    local.set(entry.name, 30)
    localParts.push(local, entry.bytes)

    const central = new Uint8Array(46 + entry.name.length)
    const cv = new DataView(central.buffer)
    write32(cv, 0, 0x02014b50) // central directory signature
    writeHeader(cv, 4, 20) // version made by
    writeHeader(cv, 6, 20) // version needed
    writeHeader(cv, 8, 0x0800) // flags: UTF-8
    writeHeader(cv, 10, 0) // compression: store
    writeHeader(cv, 12, 0)
    writeHeader(cv, 14, 0x0021)
    write32(cv, 16, entry.crc)
    write32(cv, 20, entry.bytes.length)
    write32(cv, 24, entry.bytes.length)
    writeHeader(cv, 28, entry.name.length)
    writeHeader(cv, 30, 0) // extra
    writeHeader(cv, 32, 0) // comment
    writeHeader(cv, 34, 0) // disk start
    writeHeader(cv, 36, 0) // internal attrs
    write32(cv, 38, 0) // external attrs
    write32(cv, 42, offset)
    central.set(entry.name, 46)
    centralParts.push(central)

    offset += local.length + entry.bytes.length
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  write32(ev, 0, 0x06054b50) // EOCD signature
  writeHeader(ev, 4, 0) // disk number
  writeHeader(ev, 6, 0) // central directory start disk
  writeHeader(ev, 8, entries.length)
  writeHeader(ev, 10, entries.length)
  write32(ev, 12, centralSize)
  write32(ev, 16, offset)
  writeHeader(ev, 20, 0) // comment length

  // Copy each part into its own ArrayBuffer so Blob parts are backed by a
  // plain ArrayBuffer (TS 5.9's Uint8Array<ArrayBufferLike> is not assignable).
  const parts = [...localParts, ...centralParts, end]
  const buffers = parts.map((part) => {
    const copy = new Uint8Array(part.length)
    copy.set(part)
    return copy.buffer
  })
  return new Blob(buffers, { type: "application/zip" })
}
