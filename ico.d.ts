/**
 * ICO construction for the launcher plugin: packs PNG frames into ICONDIR +
 * one ICONDIRENTRY per frame, the format Windows Vista and later render
 * natively. Only the upload path passes through here — shipped presets arrive
 * as finished multi-size `.ico` bytes.
 */
import type { Buffer } from 'node:buffer'

/**
 * Wrap one or more PNG buffers into a single multi-resolution .ico.
 * @param pngs - one frame per desired resolution; `size >= 256` is encoded as
 *   icon entry bytes 0/0. Order is preserved in the directory.
 * @returns complete .ico bytes.
 */
export function buildIco(pngs: ReadonlyArray<{ size: number; data: Buffer }>): Buffer

/**
 * Assert that `bytes` really starts with the 8-byte PNG signature, used to
 * reject non-PNG uploads at the wire before building an ICO.
 * @param bytes - candidate image payload.
 * @returns true when the payload is a PNG.
 */
export function isPng(bytes: Buffer): boolean

/**
 * Build a single-entry (256px) .ico from one PNG buffer.
 * @param png - validated PNG payload.
 * @returns .ico bytes embedding that PNG at 256 px.
 */
export function icoFromPng(png: Buffer): Buffer
