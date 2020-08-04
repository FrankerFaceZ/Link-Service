'use strict';

import BaseError from './base';

export default class RuntimeError extends BaseError {}

export class RedirectLoopError extends RuntimeError {}
export class TooManyRedirectsError extends RuntimeError {}
export class UnhandledURLError extends RuntimeError {}
export class NetworkError extends RuntimeError {}
export class TimeoutError extends RuntimeError {}
