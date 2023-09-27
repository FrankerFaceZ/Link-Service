'use strict';

import {linkToken} from './builder';

const LINK_REGEX = /(?:(https?:\/\/)?((?:[\w#%\-+=:~]+\.)+[a-z]{2,10}(?:\/[\w./#%&@()\-+=:?~]*)?))/g;
const EMAIL_REGEX = /[a-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/gi;

const HOP = Object.prototype.hasOwnProperty;

export function has(object, key) {
	return object ? HOP.call(object, key) : false;
}

/*export function linkify(text, tokenFormatter) {
	LINK_REGEX.lastIndex = 0;
	const out = [];

	let idx = 0, match;
	while ((match = LINK_REGEX.exec(text))) {
		const nix = match.index;
		if ( idx !== nix )
			out.push(text.slice(idx, nix));

		let url = match[0];
		if ( url.endsWith(')') ) {
			let open = 1, i = url.length - 1;
			while (i--) {
				const chr = url[i];
				if ( chr === ')' )
					open++;
				else if ( chr === '(' )
					open--;

				if ( ! open )
					break;
			}

			if ( open )
				url = url.slice(0, url.length - 1);
		}

		let token = tokenFormatter
			? tokenFormatter(url, match)
			: linkToken(
				`${match[1] ? '' : 'https://'}${url}`,
				match[1] ? undefined : url
			);

		out.push(token);

		idx = nix + url.length;
	}

	if ( idx < text.length )
		out.push(text.slice(idx));

	if ( out.length === 1 )
		return out[0];

	return out;
}*/


export function linkifyEmail(tokens, tokenFormatter) {
	return linkifyMatching(tokens, EMAIL_REGEX, tokenFormatter ?? (match => {
		return linkToken(
			`mailto:${match[0]}`,
			match[0]
		);
	}));
}


export function linkify(tokens, tokenFormatter) {
	return linkifyMatching(tokens, LINK_REGEX, match => {
		let url = match[0];
		if ( url.endsWith(')') ) {
			let open = 1, i = url.length - 1;
			while (i--) {
				const chr = url[i];
				if ( chr === ')' )
					open++;
				else if ( chr === '(' )
					open--;

				if ( ! open )
					break;
			}

			if ( open )
				url = url.slice(0, url.length - 1);
		}

		if ( tokenFormatter )
			return tokenFormatter(url, match);

		return linkToken(
			`${match[1] ? '' : 'https://'}${url}`,
			match[1] ? undefined : url
		);
	});
}


export function linkifyMatching(tokens, regex, tokenFormatter, include) {
	const out = [];
	regex.lastIndex = 0;

	if ( ! Array.isArray(tokens) )
		tokens = [tokens];

	for(const text of tokens) {
		if ( typeof text !== 'string' ) {
			out.push(text);
			continue;
		}

		let idx = 0, match;
		while ((match = regex.exec(text))) {
			const token = tokenFormatter(match, out);
			if ( ! token )
				continue;

			const to_inc = include ? include(match, out) : 0;

			const nix = match.index + to_inc;
			if ( idx !== nix )
				out.push(text.slice(idx, nix));

			if ( Array.isArray(token) ) {
				for(const tok of token)
					out.push(tok);
			} else
				out.push(token);

			idx = nix + match[0].length - to_inc;
		}

		if ( idx === 0 )
			out.push(text);
		else if ( idx < text.length )
			out.push(text.slice(idx));

	}

	return out.length === 1
		? out[0]
		: out
}

/**
 * Truncate a string. Tries to intelligently break the string in white-space
 * if possible, without back-tracking. The returned string can be up to
 * `ellipsis.length + target + overage` characters long.
 * @param {String} str The string to truncate.
 * @param {Number} target The target length for the result
 * @param {Number} overage Accept up to this many additional characters for a better result
 * @param {String} [ellipsis='…'] The string to append when truncating
 * @param {Boolean} [break_line=true] If true, attempt to break at the first LF
 * @param {Boolean} [trim=true] If true, runs trim() on the string before truncating
 * @returns {String} The truncated string
 */
export function truncate(str, target = 100, overage = 15, ellipsis = '…', break_line = true, trim = true) {
	if ( ! str || ! str.length )
		return str;

	if ( trim )
		str = str.trim();

	let idx = break_line ? str.indexOf('\n') : -1;
	if ( idx === -1 || idx > target )
		idx = target;

	if ( str.length <= idx )
		return str;

	let out = str.slice(0, idx).trimRight();
	if ( overage > 0 && out.length >= idx ) {
		let next_space = str.slice(idx).search(/\s+/);
		if ( next_space === -1 && overage + idx > str.length )
			next_space = str.length - idx;

		if ( next_space !== -1 && next_space <= overage ) {
			if ( str.length <= (idx + next_space) )
				return str;

			out = str.slice(0, idx + next_space);
		}
	}

	return out + ellipsis;
}


const SIZE_UNITS = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
const SIZE_FORMATTER = new Intl.NumberFormat('en-us', {maximumFractionDigits: 2});

/**
 * Format a file-size for readability.
 *
 * @param {Number} bytes The number of bytes
 * @returns {String} Formatted filesize.
 */
export function formatSize(bytes) {
	const sign = Math.sign(bytes) === -1 ? '-' : '';
	bytes = Math.abs(bytes);
	if ( bytes < 1000 )
		return `${sign}${bytes} B`;

	let u = -1;
	do {
		bytes /= 1000;
		++u;
	} while ( bytes >= 1000 && u < SIZE_UNITS.length - 1 );

	return `${sign}${SIZE_FORMATTER.format(bytes)} ${SIZE_UNITS[u]}`;
}


export function delimitArray(array, delimiter = ' • ') {
	const out = [];
	for (let i = 0, l = array.length; i < l; i++) {
		if ( i > 0 )
			out.push(delimiter);
		out.push(array[i]);
	}

	return out;
}
