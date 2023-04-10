'use strict';

let URL = global.URL;
if ( ! URL )
	URL = require('url').URL;

import MIME_TYPES from './mimes.json';
import Resolver from './resolver';
import {Redirect} from './results';
import {truncate, formatSize} from './utilities';
import {galleryToken, imageToken, styleToken, i18nToken} from './builder';

let magic;

try {
	const mmm = require('mmmagic');
	magic = new mmm.Magic();
	magic.detectAsync = util.promisify(magic.detect);
} catch {
	magic = null;
}

const MIME_TYPE_REGEX = /^(\w+)(?:\/(\w+))?/,
	REFRESH_TARGET = /\d+;\s*url=(.+)$/i,
	IMAGE_TYPES = ['png', 'jpeg', 'svg+xml', 'gif', 'webp'];


// Meta and Elements

const PREFERRED_ICON_TYPES = [
	'image/png',
	'image/jpg',
	'image/gif',
	'image/x-icon'
];

const RULES = {
	color: {
		meta: [
			'theme-color',
			'msapplication-TileColor'
		],

		rule: []
	},

	title: {
		meta: [
			'twitter:title',
			'sailthru.title'
		],

		rules: [
			c => c('.post-title').text(),
			c => c('.entry-title').text(),
			c => c('[itemtype="http://schema.org/BlogPosting"] [itemprop="name"]').text(),
			c => c('h1[class*="title"] a').text(),
			c => c('h1[class*="title"]').text(),
			c => c('title').text()
		]
	},

	description: {
		meta: [
			'twitter:description',
			'description',
			'sailthru.description'
		],

		rules: [
			c => c('.post-content p').first().text(),
			c => c('.entry-content p').first().text(),
			c => c('article p').first().text(),
			c => c('.workshopItemDescription').first().text()
		]
	},

	logo: {
		rules: [
			//c => c('link[rel="fluid-icon"]').first().attr('href'),
			//c => c('link[rel="apple-touch-icon"]').first().attr('href'),
			c => c('meta[name="msapplication-square150x150logo"]').first().attr('content'),
			c => c('meta[name="msapplication-square70x70logo"]').first().attr('content'),
			c => {
				const icons = c('link[rel="icon"],link[rel="apple-touch-icon"],link[rel="fluid-icon"]'),
					choices = [];

				for (let i = 0, l = icons.length; i < l; i++) {
					const el = c(icons[i]),
						href = el.attr('href');
					let type = el.attr('type'),
						sizes = el.attr('sizes');

					if ( ! href )
						return;

					if ( ! type ) {
						if ( href.endsWith('.ico') )
							type = 'image/x-icon';
						else if ( href.endsWith('.svg') )
							type = 'image/svg+xml';
						else if ( href.endsWith('.png') )
							type = 'image/png';
						else if ( href.endsWith('.jpg') )
							type = 'image/jpg';
						else if ( href.endsWith('.gif') )
							type = 'image/gif';
					} else
						type = type.split(';', 1)[0];

					if ( ! sizes ) {
						let match = /\b(\d+)x\d+\b/.exec(href);
						if ( match )
							sizes = match[1];
						else {
							match = /\b(\d+)px\b/.exec(href);
							if ( match )
								sizes = match[1];
							else
								sizes = 16;
						}
					}

					choices.push([type, href, parseInt(sizes, 10)]);
				}

				choices.sort((a, b) => {
					const a_type = PREFERRED_ICON_TYPES.indexOf(a[0]),
						b_type = PREFERRED_ICON_TYPES.indexOf(b[0]);

					if ( a_type !== b_type )
						return a_type - b_type;

					return b[2] - a[2];
				});

				if ( choices.length )
					return choices[0][1];

				return null;
			}
		]
	},

	image: {
		meta: [
			'twitter:image',
			'twitter:image:src',
			'sailthru.image',
			'sailthru.image.full',
			'sailthru.image.thumb'
		],

		rules: [
			c => c('article img[src]').first().attr('src'),
			c => c('#content img[src]').first().attr('src'),
			c => c('[class*="article"] img[src]').first().attr('src'),
			c => {
				// Amazon Nonsense
				const scripts = c('script');
				for (let i = 0, l = scripts.length; i < l; i++) {
					const text = scripts[i].children?.[0]?.data,
						match = text && /colorImages'\s*:\s*{.*?hiRes"\s*:\s*"([^"]+)"/.exec(text);

					if ( match )
						return match[1];
				}
			},
			c => c('img[src]').first().attr('src')
		]
	}
};


function extractMeta(source, rules) {
	if ( ! Array.isArray(source) || ! Array.isArray(rules) )
		return null;

	let match = null, match_idx = Infinity;

	for (let i = 0, l = source.length; i < l; i++) {
		const attribs = source[i].attribs,
			key = attribs.property || attribs.name || attribs.itemprop,
			val = attribs.content,
			idx = rules.indexOf(key);
		if ( idx !== -1 && idx < match_idx && typeof val === 'string' && val.length ) {
			match = val;
			match_idx = idx;
		}
	}

	return match;
}


function extractRule(source, list) {
	for (const rule of list) {
		let value = rule(source);
		if ( typeof value !== 'string' || ! value.length )
			continue;

		value = value.trim();
		if ( value )
			return value;
	}

	return null;
}


function extractFirst(type, body, meta) {
	const rules = RULES[type];
	if ( rules ) {
		const meta_out = rules.meta ? extractMeta(meta, rules.meta) : null;
		if ( meta_out )
			return meta_out;

		return rules.rules ? extractRule(body, rules.rules) : null;
	}

	return null;
}


// OpenGraph

const OG_SPLITTER = /^og:([^:]+)(?::(.*))?$/,
	OG_STRUCTURED = ['image', 'video', 'audio'],
	OG_INTS = ['width', 'height', 'duration', 'disc', 'track'],
	OG_BOOLS = ['user_generated'],
	OG_WRONG_KEYS = {
		'og:image:secure': 'og:image:secure_url'
	};


function extractOpenGraph(meta) {
	const output = {};

	for (const tag of meta) {
		const attribs = tag.attribs,
			raw_key = attribs.property || attribs.name || attribs.itemprop,
			fixed_key = OG_WRONG_KEYS[raw_key] || raw_key,
			match = OG_SPLITTER.exec(fixed_key);

		if ( ! match || ! match[1] )
			continue;

		const key = match[1],
			is_structured = OG_STRUCTURED.includes(key);
		let subkey = match[2],
			content = attribs.content;

		if ( is_structured && ! subkey )
			subkey = 'url';

		if ( OG_INTS.includes(key) || OG_INTS.includes(subkey) )
			content = parseInt(content, 10);

		else if ( OG_BOOLS.includes(key) || OG_BOOLS.includes(subkey) ) {
			const test = content.trim().toLowerCase();
			content = test === 'true' || test === '1';
		}

		if ( is_structured ) {
			const values = output[key] = output[key] || [];
			let value;

			if ( ! values.length || subkey === 'url' ) {
				value = {};
				values.push(value);
			} else
				value = values[values.length - 1];

			value[subkey] = content;

		} else if ( subkey )
			output[`${key}:${subkey}`] = content;

		else
			output[key] = content;
	}

	return output;
}


export default class Metadata extends Resolver {

	handles() {
		return true;
	}

	processHeaders(request, ctx) {
		const [content_type, base, trail] = MIME_TYPE_REGEX.exec(request.headers.get('Content-Type')) || [];
		const size = parseInt(request.headers.get('Content-Length') || -1, 10);

		const data = {
			mime: content_type,
			size
		};

		// If the document is larger than 5MB, or we don't know the content type,
		// then we aren't interested.
		if ( content_type && size < 5000000 ) {
			if ( size === 0 )
				return false;

			if ( base === 'image' && IMAGE_TYPES.includes(trail) ) {
				// We support this image. We don't care about the content.
				data.image = request.url;

			} else if ( content_type.includes('text/html') || content_type.includes('application/xhtml+xml') ) {
				ctx.response = data;
				return 'html';

			} else if ( content_type.includes('application/binary') || content_type.includes('application/octet') ) {
				ctx.response = data;
				return 'buffer';
			}
		}

		const file_type = MIME_TYPES[content_type];

		let builder = this.builder()
			.setLogo(data.image ? this.proxyImage(data.image) : null, {sfw: false})
			.setTitle(file_type ?? [
				i18nToken('embed.metadata.unknown-type', 'Unknown Type'),
				' ',
				styleToken({color: 'alt-2'}, ['(', content_type, ')'])
			])
			.setSubtitle(formatSize(size));

		if ( data.image )
			builder = builder.addConditional(true, true, galleryToken(imageToken(this.proxyImage(data.image), {sfw: false})));

		ctx.response = {
			v: 5,

			short: builder.header,
			full: builder
		};

		return false;
	}

	processBody(data, mode, ctx, request) {
		if ( mode === 'buffer' )
			return this.extractBufferType(data, ctx, request);

		else if ( mode === 'html' )
			return this.extractMetadata(data, ctx, request);

		return null;
	}

	async extractBufferType(body, ctx) {
		const response = ctx.response;

		let file_type;
		if ( magic )
			try {
				file_type = await magic.detectAsync(body);
			} catch (err) {
				console.error('Error detecting mime type from buffer for', response.mime, err);
			}

		if ( ! file_type )
			file_type = MIME_TYPES[response.mime];

		const builder = this.builder()
			.setTitle(file_type ?? [
				i18nToken('embed.metadata.unknown-type', 'Unknown Type'),
				' ',
				styleToken({color: 'alt-2'}, ['(', response.mime, ')'])
			])
			.setSubtitle(formatSize(response.size));

		return  {
			v: 5,

			short: builder.header,
			full: builder
		};
	}

	extractMetadata(body, ctx) {
		const response = ctx.response = ctx.response || {};

		// Fetch all the meta tags right now. We'll be seeing a lot of them.
		const meta = Array.from(body('meta'));

		// Check for Refresh
		for (const tag of meta) {
			if ( tag.attribs['http-equiv'] === 'refresh' ) {
				const match = REFRESH_TARGET.exec(tag.attribs.content);
				if ( match )
					return new Redirect(match[1], ctx.url);
				break;
			}
		}

		const og_data = response.og = extractOpenGraph(meta);

		let title, subtitle, description, images, logo;

		if ( og_data ) {
			title = truncate(og_data.title);
			subtitle = truncate(og_data.subtitle || og_data.site_name);
			description = og_data.description;

			if ( og_data.image ) {
				images = [];
				const has_user_gen = og_data.image.some(image => image.user_generated);
				for (const image of og_data.image) {
					let url = image.secure_url || image.url;
					if ( ! url )
						continue;

					try {
						url = this.service.normalizeURL(url);
					} catch (err) {
						continue;
					}

					if ( ! has_user_gen || image.user_generated )
						images.push(image);
					else
						logo = image.secure_url || image.url;
				}
			}
		}


		const color = truncate(extractFirst('color', body, meta));

		if ( ! title )
			title = truncate(extractFirst('title', body, meta));

		if ( ! description )
			description = extractFirst('description', body, meta);

		if ( ! images || ! images.length ) {
			const raw_image = extractFirst('image', body, meta);
			if ( raw_image )
				try {
					images = [{url: this.service.normalizeURL(raw_image)}];
				} catch (err) { /* no-op */ }
		}

		let media = '';
		let preview;

		if ( images && images.length > 0 ) {
			if ( images.length > 4 )
				images = images.slice(0, 4);

			if ( images.length > 1 )
				media = images.map(image => {
					const proxied = this.proxyImage(this.service.normalizeURL(image.secure_url || image.url, ctx.url));
					if ( ! proxied )
						return null;

					if ( ! preview )
						preview = proxied;

					return proxied;

				}).filter(x => x != null);

			else {
				const proxied = this.proxyImage(new URL(images[0].secure_url || images[0].url, ctx.url));
				if ( proxied ) {
					if ( ! preview )
						preview = proxied;
				}
			}
		}

		if ( ! logo )
			logo = extractFirst('logo', body, meta);

		if ( logo )
			logo = this.proxyImage(new URL(logo, ctx.url), '100x48,fit');


		// Output

		if ( (! title || ! title.length) && (! subtitle || ! subtitle.length) ) {
			title = i18nToken('embed.metadata.untitled', 'Untitled HTML Document');
			subtitle = formatSize(response.size);
		}

		return {
			v: 5,
			accent: color,

			short: this.builder()
				.setTitle(title)
				.setSubtitle(subtitle)
				.setLogo(preview || logo, {sfw: false}),

			full: this.builder()
				.setTitle(title)
				.setSubtitle(subtitle)
				.setLogo(logo, {sfw: false})
				.addBox({lines: 5, 'mg-y': 'small', wrap: 'pre-wrap'}, truncate(description, 1000, undefined, undefined, false))
				.addConditional(true, true, galleryToken(preview))
		};
	}

}

Metadata.sort = -1;
Metadata.examples = [
	{title: 'GitHub', url: 'https://github.com/FrankerFaceZ/FrankerFaceZ'},
	{title: 'Example - Malware', resolver: 'SafeBrowsing', url: 'http://testsafebrowsing.appspot.com/apiv4/ANY_PLATFORM/MALWARE/URL/'},
	{title: 'Invalid Host', resolver: 'Bad URLs', url: 'http://127.0.0.1/'},
	{title: 'Invalid Host', resolver: 'Bad URLs', url: 'http://localhost/'},
	{title: 'Invalid Port', resolver: 'Bad URLs', url: 'http://google.com:21'},
	{title: 'Invalid Scheme', resolver: 'Bad URLs', url: 'ftp://google.com'},
	{title: '400 Bad Request', resolver: 'Bad URLs', url: 'http://httpbin.org/status/400'},
	{title: '401 Unauthorized', resolver: 'Bad URLs', url: 'http://httpbin.org/status/401'},
	{title: '403 Forbidden', resolver: 'Bad URLs', url: 'http://httpbin.org/status/403'},
	{title: '404 Not Found', resolver: 'Bad URLs', url: 'http://httpbin.org/status/404'},
	{title: '500 Internal Server Error', resolver: 'Bad URLs', url: 'http://httpbin.org/status/500'}
];
