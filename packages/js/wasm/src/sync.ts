import { assertReady, raw } from './load.js'

export interface SyncCursor {
  ledgerSequence: number
  pagingToken: string
  totalProcessed: number
}

/** Serialize a sync cursor to a JSON string, for localStorage persistence in browsers. */
export function serializeCursor(cursor: SyncCursor): string {
  assertReady('serializeCursor')
  return raw.serialize_cursor(cursor.ledgerSequence, cursor.pagingToken, cursor.totalProcessed)
}

/** Parse a serialized cursor JSON string, returning its `pagingToken` field. */
export function parseCursorPagingToken(cursorJson: string): string | undefined {
  assertReady('parseCursorPagingToken')
  return raw.parse_cursor_paging_token(cursorJson)
}
