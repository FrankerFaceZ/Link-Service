'use strict';

import BaseError from './base';
import {i18nToken} from '../builder';

export default class URLError extends BaseError {
	getMessage() {
		return i18nToken('card.error.invalid-url', 'The provided URL is not valid.')
	}
}

export class RelativeURLError extends URLError {}
export class UnsupportedSchemeError extends URLError {
	getMessage() {
		return i18nToken('card.error.invalid-scheme', 'The provided URL does not use HTTP and will not be checked.')
	}
}
export class UnsupportedPortError extends URLError {
	getMessage() {
		return i18nToken('card.error.invalid-port', 'The provided URL has a non-standard port and will not be checked.')
	}
}
export class InvalidHostError extends URLError {
	getMessage() {
		return i18nToken('card.error.invalid-host', 'The provided URL has an invalid host and cannot be checked.')
	}
}
export class MalformedURL extends URLError {}
