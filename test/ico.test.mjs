/**
 * ICO construction contract for the upload path.
 *
 * Pins the ICONDIR / ICONDIRENTRY layout Windows actually reads: a 6-byte
 * header, one 16-byte entry per frame, and payload offsets that start right
 * after the directory. The >64 KiB case is a regression guard: the payload
 * byte-count field is 32-bit, and writing it as 16 bits silently truncates any
 * real 256px PNG (which routinely exceeds 64 KiB).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildIco, isPng, icoFromPng } from '../ico.js'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** A PNG-shaped buffer: valid signature plus `tail` filler bytes. */
function png(bytes) {
  return Buffer.concat([PNG_SIGNATURE, Buffer.alloc(bytes, 0x41)])
}

const ICONDIR_SIZE = 6
const ICONDIRENTRY_SIZE = 16

test('isPng accepts a real PNG signature and rejects everything else', () => {
  assert.equal(isPng(png(0)), true, 'bare signature')
  assert.equal(isPng(png(1024)), true, 'signature plus payload')

  assert.equal(isPng(Buffer.alloc(0)), false, 'empty buffer')
  assert.equal(isPng(PNG_SIGNATURE.subarray(0, 7)), false, 'one byte short of the signature')
  assert.equal(isPng(Buffer.from('this is definitely not an image')), false, 'plain text')
  assert.equal(isPng(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])), false, 'JPEG magic')
  // Same first seven bytes, but the trailing CR LF pair is wrong.
  assert.equal(
    isPng(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x00])),
    false,
    'signature without the trailing 1A-0A',
  )
})

test('buildIco writes a valid ICONDIR for one frame', () => {
  const frame = png(200)
  const ico = buildIco([{ size: 256, data: frame }])

  assert.equal(ico.readUInt16LE(0), 0, 'reserved field is 0')
  assert.equal(ico.readUInt16LE(2), 2, 'type 2 means icon')
  assert.equal(ico.readUInt16LE(4), 1, 'one directory entry')

  const e = ICONDIR_SIZE
  assert.equal(ico[e], 0, '256px encodes as width 0')
  assert.equal(ico[e + 1], 0, '256px encodes as height 0')
  assert.equal(ico.readUInt32LE(e + 8), frame.length, 'entry byte count')
  assert.equal(ico.readUInt32LE(e + 12), ICONDIR_SIZE + ICONDIRENTRY_SIZE, 'payload follows the directory')
})

test('buildIco writes one entry per frame with cumulative offsets and 32-bit lengths', () => {
  // The 256px frame is deliberately larger than 64 KiB: a 16-bit length field
  // would truncate it here, which is exactly the bug this pins.
  const frames = [
    { size: 256, data: png(70 * 1024) },
    { size: 48, data: png(300) },
    { size: 16, data: png(64) },
  ]
  const ico = buildIco(frames)

  assert.equal(ico.readUInt16LE(4), frames.length, 'entry count matches the frame count')
  assert.ok(frames[0].data.length > 64 * 1024, 'the large frame really does exceed 64 KiB')

  let expectedOffset = ICONDIR_SIZE + ICONDIRENTRY_SIZE * frames.length
  for (const [i, frame] of frames.entries()) {
    const e = ICONDIR_SIZE + i * ICONDIRENTRY_SIZE
    const width = ico[e]
    const height = ico[e + 1]
    assert.equal(width, frame.size >= 256 ? 0 : frame.size, `entry ${i} width`)
    assert.equal(height, frame.size >= 256 ? 0 : frame.size, `entry ${i} height`)
    assert.equal(ico.readUInt32LE(e + 8), frame.data.length, `entry ${i} byte count is 32-bit`)
    assert.equal(ico.readUInt32LE(e + 12), expectedOffset, `entry ${i} payload offset`)
    expectedOffset += frame.data.length
  }

  // Total size is exactly header + directory + payloads.
  assert.equal(ico.length, expectedOffset, 'no trailing or missing bytes')
})

test('buildIco payloads round-trip through their recorded offsets', () => {
  const frames = [
    { size: 256, data: png(70 * 1024) },
    { size: 32, data: png(500) },
    { size: 16, data: png(10) },
  ]
  const ico = buildIco(frames)

  frames.forEach((frame, i) => {
    const e = ICONDIR_SIZE + i * ICONDIRENTRY_SIZE
    const offset = ico.readUInt32LE(e + 12)
    const length = ico.readUInt32LE(e + 8)
    // Compare lengths first: on a truncated length field the deepEqual diff of
    // a 70 KiB buffer costs tens of seconds, while this names the cause fast.
    assert.equal(length, frame.data.length, `frame ${i} recorded length`)
    assert.deepEqual(ico.subarray(offset, offset + length), frame.data, `frame ${i} payload`)
  })
})

test('icoFromPng produces exactly one 256px entry embedding the PNG', () => {
  const frame = png(256)
  const ico = icoFromPng(frame)

  assert.equal(ico.readUInt16LE(4), 1, 'one entry')
  assert.equal(ico[ICONDIR_SIZE], 0, 'width 0 encodes 256')
  assert.equal(ico[ICONDIR_SIZE + 1], 0, 'height 0 encodes 256')
  assert.deepEqual(ico.subarray(ICONDIR_SIZE + ICONDIRENTRY_SIZE), frame, 'the PNG is embedded verbatim')
})
