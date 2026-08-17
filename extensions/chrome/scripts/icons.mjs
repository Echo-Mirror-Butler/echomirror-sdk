// Generates the extension icons at build time.
//
// The artwork is a handful of shapes, so it is drawn here instead of checking
// binary PNGs into the repo: the sizes stay in sync and the source of the mark
// is reviewable text. Rendered at 4x and box-filtered down for antialiasing.

import { deflateSync } from 'node:zlib'
import { crc32 } from './lib/crc32.mjs'

const SUPERSAMPLE = 4

/** Rounded-square background gradient, top to bottom. */
const TOP = [99, 102, 241]
const BOTTOM = [67, 56, 202]

function insideRoundedSquare(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius)
  const cy = Math.min(Math.max(y, radius), size - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

/** @returns {[number, number, number, number]} straight-alpha RGBA */
function samplePixel(x, y, size) {
  const radius = size * 0.22
  if (!insideRoundedSquare(x, y, size, radius)) return [0, 0, 0, 0]

  const t = y / size
  const bg = [
    Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
    Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
    Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
  ]

  // Mirror ring.
  const dx = x - size / 2
  const dy = y - size / 2
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist <= size * 0.31 && dist >= size * 0.21) return [255, 255, 255, 255]

  // Reflection highlight inside the ring.
  const hx = x - size * 0.41
  const hy = y - size * 0.41
  if (Math.sqrt(hx * hx + hy * hy) <= size * 0.055) return [255, 255, 255, 180]

  return [bg[0], bg[1], bg[2], 255]
}

/** @returns {Buffer} RGBA rows, `size` x `size` */
function render(size) {
  const hi = size * SUPERSAMPLE
  const out = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const [pr, pg, pb, pa] = samplePixel(
            x * SUPERSAMPLE + sx + 0.5,
            y * SUPERSAMPLE + sy + 0.5,
            hi,
          )
          // Premultiply so partially transparent edges do not darken.
          r += pr * pa
          g += pg * pa
          b += pb * pa
          a += pa
        }
      }
      const i = (y * size + x) * 4
      out[i] = a ? Math.round(r / a) : 0
      out[i + 1] = a ? Math.round(g / a) : 0
      out[i + 2] = a ? Math.round(b / a) : 0
      out[i + 3] = Math.round(a / (SUPERSAMPLE * SUPERSAMPLE))
    }
  }
  return out
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

/** Encode straight-alpha RGBA rows as a PNG. */
function encodePng(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // compression: deflate
  ihdr[11] = 0 // filter method
  ihdr[12] = 0 // interlace: none

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** @param {number} size @returns {Buffer} PNG bytes */
export function iconPng(size) {
  return encodePng(render(size), size)
}
