'use strict';

import BaseError from './base';
import {i18nToken} from '../builder';

export default class URLError extends BaseError {
	getMessage() {
		return i18nToken('card.error.invalid-url', 'The provided URL is not valid.')
	}
}

export class RelativeURLError extends URLError {}
export class UnsupportedSchemeError extends URLError {}
export class InvalidHostError extends URLError {}
export class MalformedURL extends URLError {}
