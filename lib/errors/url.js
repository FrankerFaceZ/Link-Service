'use strict';

import BaseError from './base';

export default class URLError extends BaseError {}

export class RelativeURLError extends URLError {}
export class UnsupportedSchemeError extends URLError {}
export class InvalidHostError extends URLError {}
