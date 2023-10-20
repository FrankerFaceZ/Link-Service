'use strict';

let URL = global.URL;
if ( ! URL )
	URL = require('url').URL;

import MIME_TYPES from './mimes.json';
import cheerio from 'cheerio';
import Resolver from './resolver';
import {Redirect} from './results';
import {truncate, formatSize} from './utilities';
import {galleryToken, imageToken, styleToken, i18nToken, refToken} from './builder';

import {parse as parseCD} from 'content-disposition';
import { RedirectLoopError } from './errors/runtime';

let magic;

function loadMagic() {
	if ( magic )
		return magic;

	/*try {
		const mmm = require('mmmagic');
		magic = new mmm.Magic();
		magic.detectAsync = util.promisify(magic.detect);
	} catch {
		magic = null;
	}*/

	return magic;
}


const MIME_TYPE_REGEX = /^(\w+)(?:\/(\w+))?/,
	//OLD_REFRESH_TARGET = /\d+;\s*url=(.+)$/i,
	REFRESH_TARGET = /^\s*(\d+)(?:\s*;(?:\s*url\s*=)?\s*(?:["']\s*(.*?)\s*['"]|(.*?)))?\s*$/i,
	IMAGE_TYPES = ['png', 'jpeg', 'svg+xml', 'gif', 'webp'],
	AUDIO_TYPES = ['wav', 'mpeg', 'mp4', 'aac', 'aacp', 'oog', 'webm', 'flac'];


// Meta and Elements

function canEmbedText(type) {
	if ( /^text\/html\b/i.test(type) )
		return false;

	return /\bjson\b/i.test(type) || /^text\//i.test(type) || /\bxml\b/.test(type);
}


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
			c => c('.workshopItemDescription').first().text(),
			c => c('#left-content p').first().text()
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
			},
			c => c('.fandom-community-header__image img').first().attr('src')
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


export function extractOpenGraph(meta) {
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

	async processHeaders(request, ctx) {
		if ( ! request.ok )
			return false;

		const [content_type, base, trail] = MIME_TYPE_REGEX.exec(request.headers.get('Content-Type')) || [];

		let size = -1;
		const range = request.headers.get('Content-Range'),
			length = request.headers.get('Content-Length');

		if ( range && range.startsWith('bytes ') ) {
			const bits = range.split('/');
			if ( bits.length > 1 )
				size = parseInt(bits[1], 10);
		}

		if ( size === -1 && length )
			size = parseInt(length, 10);

		if ( isNaN(size) || ! isFinite(size) )
			size = -1;

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
				ctx.meta = data;
				return 'html';

			} else if ( this.service.opts.use_mmmagic && (content_type.includes('application/binary') || content_type.includes('application/octet')) ) {
				ctx.meta = data;
				return 'buffer';

			} else if ( canEmbedText(content_type) ) {
				ctx.meta = data;
				return /\bjson\b/i.test(content_type)
					? 'json'
					: 'text';
			}
		}

		const file_type = MIME_TYPES[content_type];

		const raw_cd = request.headers.get('Content-Disposition');
		let cd;
		if ( raw_cd )
			try {
				cd = parseCD(raw_cd);
			} catch(err) {
				/* no-op */
			}

		const image = data.image
			? await this.proxyImage(data.image)
			: null;

		let builder = this.builder()
			.setLogo(image, {sfw: false})
			.setTitle(file_type ?? [
				i18nToken('unknown-type', 'Unknown Type'),
				' ',
				styleToken({color: 'alt-2'}, ['(', content_type, ')'])
			]);

		if ( cd && cd.type === 'attachment' && cd.parameters.filename )
			builder = builder
				.setSubtitle(cd.parameters.filename)
				.setExtra(formatSize(size));
		else
			builder = builder
				.setSubtitle(formatSize(size));

		if ( image )
			builder = builder.addConditional(true, true, galleryToken(imageToken(image, {sfw: false})));

		/*if ( base === 'audio' && AUDIO_TYPES.includes(trail) )
			builder = builder.add({
				type: 'player',
				audio: true,
				content: [
					'click here to load sound file'
				],
				sources: [
					{type: content_type, src: request.url}
				]
			});*/

		ctx.response = {
			v: 8,
			i18n_prefix: 'embed.metadata',

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

		else if ( mode === 'json' || mode === 'text' )
			return this.extractText(data, mode, ctx);

		return null;
	}

	extractText(data, mode, ctx) {
		const file_type = MIME_TYPES[ctx.meta.mime];
		const size = ctx.meta.size;

		if ( mode === 'json' )
			data = JSON.stringify(data, null, '\t');
		if ( typeof data !== 'string' )
			data = data.toString();

		if ( data.length > 1000 )
			data = truncate(data, 1000, undefined, undefined, false);

		let builder = this.builder()
			.setTitle(file_type ?? [
				i18nToken('embed.metadata.unknown-type', 'Unknown Type'),
				' ',
				styleToken({color: 'alt-2'}, ['(', content_type, ')'])
			])
			.setSubtitle(formatSize(size));

		if ( data?.length )
			builder = builder
				.addBox({'mg-y': 'small', wrap: 'pre-wrap', lines: 10}, data);

		return {
			v: 5,

			short: builder.header,
			full: builder
		}
	}

	async extractBufferType(body, ctx) {
		const meta = ctx.meta;

		let file_type;
		if ( this.service.opts.use_mmmagic && loadMagic() )
			try {
				file_type = await magic.detectAsync(body);
			} catch (err) {
				console.error('Error detecting mime type from buffer for', meta.mime, err);
			}

		if ( ! file_type )
			file_type = MIME_TYPES[meta.mime];

		const builder = this.builder()
			.setTitle(file_type ?? [
				i18nToken('embed.metadata.unknown-type', 'Unknown Type'),
				' ',
				styleToken({color: 'alt-2'}, ['(', meta.mime, ')'])
			])
			.setSubtitle(formatSize(meta.size));

		return  {
			v: 5,

			short: builder.header,
			full: builder
		};
	}

	async extractMetadata(body, ctx) {
		const meta = ctx.meta = ctx.meta || {};

		// Fetch all the meta tags right now. We'll be seeing a lot of them.
		const meta_tags = Array.from(body('meta'));

		// Check for Refresh
		for (const tag of meta_tags) {
			if ( tag.attribs['http-equiv'] === 'refresh' ) {
				const match = REFRESH_TARGET.exec(tag.attribs.content);
				if ( match ) {
					let url = match[2] || match[3] || null;
					if ( url ) {
						// Detect redirect loops. We'll define a redirect loop
						// for now as an attempt to redirect to the same page
						// that we're already on, while the referrer is already
						// the same page.
						//
						// This doesn't necessarily account for some cookie
						// weirdness, but it should prevent stupid Russian
						// anti-bot JavaScript nonsense.
						const target = new URL(url, ctx.url).toString();
						if ( target === ctx.url.toString() && target === ctx.referrer?.toString?.() )
							throw new RedirectLoopError();

						return new Redirect(url, ctx.url);
					}
				}
				break;
			}
		}

		const og_data = meta.og = extractOpenGraph(meta_tags);

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
						url = new URL(url, ctx.url);
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


		const color = truncate(extractFirst('color', body, meta_tags));

		if ( ! title )
			title = truncate(extractFirst('title', body, meta_tags));

		if ( ! description )
			description = extractFirst('description', body, meta_tags);

		if ( ! images || ! images.length ) {
			const raw_image = extractFirst('image', body, meta_tags);
			if ( raw_image )
				try {
					images = [{url: new URL(raw_image, ctx.url)}];
				} catch (err) { /* no-op */ }
		}

		if ( ctx.url?.hostname.includes('github.com') && description )
			try {
				description = cheerio.load(description).text();
			} catch(err) {
				/* no error */
			}

		let media;
		let preview;

		//console.log('images', images);

		if ( images && images.length > 0 ) {
			if ( images.length > 4 )
				images = images.slice(0, 4);

			if ( images.length > 1 ) {
				media = [];
				for(const image of images) {
					const proxied = await this.proxyImage(new URL(image.secure_url || image.url, ctx.url));
					if ( ! proxied )
						continue;

					if ( ! preview )
						preview = proxied;

					media.push(proxied);
				}

			} else {
				const proxied = await this.proxyImage(new URL(images[0].secure_url || images[0].url, ctx.url));
				if ( proxied ) {
					if ( ! preview )
						preview = proxied;
				}
			}
		}

		if ( ! logo )
			logo = extractFirst('logo', body, meta_tags);

		if ( logo )
			logo = await this.proxyImage(new URL(logo, ctx.url), '100x48,fit');


		// Output

		if ( (! title || ! title.length) && (! subtitle || ! subtitle.length) ) {
			title = i18nToken('embed.metadata.untitled', 'Untitled HTML Document');
			subtitle = formatSize(meta.size);
		}

		const fragments = {
			title,
			subtitle,
			desc: truncate(description, 1000, undefined, undefined, false)
		}

		let full = this.builder()
			.setTitle(refToken('title'))
			.setSubtitle(refToken('subtitle'))
			.setLogo(logo, {sfw: false});

		if ( fragments.desc?.length )
			full = full
				.addBox({lines: 5, 'mg-y': 'small', wrap: 'pre-wrap'}, refToken('desc'));

		if ( media?.length > 1 )
			full = full
				.addConditional(true, true, galleryToken(...media));
		else if ( preview )
			full = full
				.addConditional(true, true, galleryToken(preview));

		return {
			v: 5,
			accent: color,
			fragments,

			short: this.builder()
				.setTitle(refToken('title'))
				.setSubtitle(refToken('subtitle'))
				.setExtra(refToken('desc'))
				.setLogo(preview || logo, {sfw: false}),

			full
		};
	}

}

Metadata.sort = -1;
Metadata.examples = [
	{title: 'GitHub', url: 'https://github.com/FrankerFaceZ/FrankerFaceZ'},
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
