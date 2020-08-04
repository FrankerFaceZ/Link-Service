'use strict';

import BaseError from './base';
import {i18nToken} from '../builder';

export default class RuntimeError extends BaseError {}

export class RedirectLoopError extends RuntimeError {
	getMessage() {
		return i18nToken('card.error.redirect-loop', 'Redirect Loop')
	}
}

export class TooManyRedirectsError extends RuntimeError {
	getMessage() {
		return i18nToken('card.error.redirects', 'Too Many Redirects')
	}
}

export class UnhandledURLError extends RuntimeError {
	getMessage() {
		return i18nToken('card.error.unhandled', 'No handler supports this URL.')
	}
}

export class NetworkError extends RuntimeError {
	getMessage() {
		return i18nToken('card.error.network', 'A network error occured.')
	}
}

export class TimeoutError extends RuntimeError {
	getMessage() {
		return i18nToken('card.error.timeout', 'The request timed out.')
	}
}
