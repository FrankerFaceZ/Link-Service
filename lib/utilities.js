'use strict';

import { load as cheerioLoad } from 'cheerio';

import DocumentBuilder, {boxToken, imageToken, linkToken, styleToken} from './builder';

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


const SIZE_UNITS = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
	SIZE_UNITS_I = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
const SIZE_FORMATTER = new Intl.NumberFormat('en-us', {maximumFractionDigits: 2});

/**
 * Format a file-size for readability.
 *
 * @param {Number} bytes The number of bytes
 * @returns {String} Formatted filesize.
 */
export function formatSize(bytes, i = false) {
	const sign = Math.sign(bytes) === -1 ? '-' : '';
	bytes = Math.abs(bytes);
	const threshold = i ? 1024 : 1000,
		units = i ? SIZE_UNITS_I : SIZE_UNITS;

	if ( bytes < threshold )
		return `${sign}${bytes} B`;

	let u = -1;
	do {
		bytes /= threshold;
		++u;
	} while ( bytes >= threshold && u < units.length - 1 );

	return `${sign}${SIZE_FORMATTER.format(bytes)} ${units[u]}`;
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


export function makeEnum(...array) {
	const out = {};

	for(let i=0; i < array.length; i++) {
		const word = array[i];
		out[word] = i;
		out[i] = word;
	}

	return out;
}


export function findMatchingToken(token, fn) {
	if ( ! token )
		return null;

	if ( Array.isArray(token) ) {
		for(const tok of token) {
			const result = tok ? findMatchingToken(tok, fn) : null;
			if ( result )
				return result;
		}
		return null;
	}

	if ( fn(token) )
		return token;

	if ( token.content ) {
		const result = findMatchingToken(token.content, fn);
		if ( result )
			return result;
	}

	if ( token.alternative ) {
		const result = findMatchingToken(token.alternative, fn);
		if ( result )
			return result;
	}

	if ( Array.isArray(token.items) ) {
		for(const tok of token.items) {
			const result = tok ? findMatchingToken(tok, fn) : null;
			if ( result )
				return result;
		}
	}

	if ( Array.isArray(token.fields) ) {
		for(const tok of token.fields) {
			const result = tok ? findMatchingToken(tok, fn) : null;
			if ( result )
				return result;
		}
	}

	// TODO: overlay token corners

}


export function parseHTML(html) {
	const doc = cheerioLoad(html),
		body = doc("body").first();

	if ( ! body || body.length !== 1 )
		return null;

	return body[0];
}


export function tokenizeNode(node, allowImages = false, proxyImage = null) {
	if (! node)
		return null;

	if (Array.isArray(node)) {
		const result = [];
		let want_line = false;

		for(const child of node) {
			const val = tokenizeNode(child, allowImages, proxyImage);
			if (val) {
				if (want_line) {
					result.push('\n\n');
					want_line = false;
				}
				if (Array.isArray(val)) {
					for(const v of val)
						result.push(v);
				} else
					result.push(val);
			}

			want_line = want_line || (child.type == 'tag' && child.name == 'p');
		}

		return result;
	}

	if (node.type === 'text')
		return node.data;

	if (node.type !== 'tag') {
		console.log('unknown node type', node);
		return null;
	}

	const tag = node.name;
	if (tag === 'body') {
		// Body.
		return tokenizeNode(node.children, allowImages, proxyImage);
	}

	if (tag === 'a') {
		// Link
		let ret = tokenizeNode(node.children, allowImages, proxyImage);
		if (!ret)
			return ret;

		return linkToken(
			node.attribs.href,
			ret
		);

	} else if (tag === 'span') {
		// Span
		const cls = node.attribs?.class;
		if (cls === 'invisible')
			return null;

		let ret = tokenizeNode(node.children, allowImages, proxyImage);
		if (!ret)
			return null;

		if (cls === 'ellipsis') {
			if (Array.isArray(ret))
				ret.push('…');
			else
				ret = [ret, '…'];
		}

		return ret;

	} else if (tag === 'p') {
		// Paragraph
		return tokenizeNode(node.children, allowImages, proxyImage);

	} else if (tag === 'br') {
		return '\n';

	} else if ( tag === 'strong' ) {
		let ret = tokenizeNode(node.children, allowImages, proxyImage);
		if ( ! ret )
			return ret;

		return styleToken({weight: 'semibold'}, ret);

	} else if ( /^h[1-6]$/i.test(tag) ) {
		// header
		let ret = tokenizeNode(node.children, allowImages, proxyImage);
		if ( ! ret )
			return '\n';

		return ['\n', styleToken({weight: 'semibold'}, ret), '\n'];

	} else if ( tag === 'img' ) {
		if ( ! allowImages || ! node.attribs?.src )
			return null;

		let src = node.attribs.src;
		if ( proxyImage )
			src = proxyImage(src);

		return imageToken(
			src,
			{
				alt: node.attribs.alt ?? undefined
			}
		)

	} else if ( tag === 'li' ) {
		let ret = tokenizeNode(node.children, allowImages, proxyImage);
		if ( ! ret )
			return ret;

		if ( ! Array.isArray(ret) )
			return ['\n* ', ret];

		ret.unshift('\n* ');
		return ret;

	} else {
		// ???
		console.log('disallowed tag', tag);
		return tokenizeNode(node.children, allowImages, proxyImage);
	}
}


export function finishObject(doc) {
	if ( ! doc )
		return doc;

	if ( doc.short instanceof DocumentBuilder )
		doc.short = doc.short.done().toJSON();
	if ( doc.mid instanceof DocumentBuilder )
		doc.mid = doc.mid.done().toJSON();
	if ( doc.full instanceof DocumentBuilder )
		doc.full = doc.full.done().toJSON();

	if ( doc.fragments )
		for(const [key, val] of Object.entries(doc.fragments))
			if ( val instanceof DocumentBuilder )
				doc.fragments[key] = val.done().toJSON();

	return doc;
}
