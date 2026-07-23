# Class: EchoMirrorError

Defined in: [packages/js/core/src/errors.ts:1](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/core/src/errors.ts#L1)

## Extends

- `Error`

## Extended by

- [`AuthError`](AuthError.md)
- [`NetworkError`](NetworkError.md)
- [`RateLimitError`](RateLimitError.md)

## Constructors

### Constructor

> **new EchoMirrorError**(`message`, `statusCode?`): `EchoMirrorError`

Defined in: [packages/js/core/src/errors.ts:2](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/core/src/errors.ts#L2)

#### Parameters

##### message

`string`

##### statusCode?

`number`

#### Returns

`EchoMirrorError`

#### Overrides

`Error.constructor`

## Properties

### message

> **message**: `string`

Defined in: docs-site/node\_modules/typescript/lib/lib.es5.d.ts:1075

#### Inherited from

`Error.message`

***

### name

> **name**: `string`

Defined in: docs-site/node\_modules/typescript/lib/lib.es5.d.ts:1074

#### Inherited from

`Error.name`

***

### stack?

> `optional` **stack?**: `string`

Defined in: docs-site/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

`Error.stack`

***

### statusCode?

> `readonly` `optional` **statusCode?**: `number`

Defined in: [packages/js/core/src/errors.ts:4](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/core/src/errors.ts#L4)
