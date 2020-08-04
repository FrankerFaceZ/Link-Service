# Response Format

The link service should return the following format.

```javascript
{
	/*************************\
	 * Resolver Specific Data *
	\*************************/

	// The Tooltip Version. Prevents earlier clients from trying to render
	// new content with potentially problematic results.
	// Type: Number. Valid: 5
	"v": 5,

	// An accent color, optionally used when presenting content.
	// Type: String. Valid: Any CSS Color
	"accent": "#F00",

	// A short embed, intended for use in space limited areas such as Twitch
	// chat. The official client uses this for embeds within chat. Typically
	// this should include just a header with a preview image, a title, and
	// one or two lines of description. Embeds are comprised of one or more
	// rich tokens.
	// Type: Rich Token Document.
	"short": TOKEN,

	// A longer embed, for when more space is available. The official client
	// uses this for rendering tooltips. This can include more text, multiple
	// images, and possibly even something like a video. Embeds are comprised
	// of one or more rich tokens.
	// Optional. Type: Rich Token Document.
	"full": TOKEN,


	/**************\
	 * Global Data *
	\**************/

	// This data is handled by the core link service and not by any specific
	// resolver. Resolvers should not return this data.


	// URL Safety
	// Currently, our only data source for URL safety is Google SafeBrowsing.
	// We would like to expand this service in the future, possibly with the
	// help of a Twitch-centric project.

	// Whether or not any of the URLs in the entire redirect chain have been
	// flagged for safety concerns. If this is true, one of the present URLs
	// has been flagged as unsafe. If this is false, none of the URLs are known
	// to be unsafe, though they could still be unsafe.
	// Type: Boolean.
	"unsafe": true,

	// The full redirect chain, with details on each specific URL.
	"urls": [
		{"url": "http://sketchy-redirect.example", "unsafe": true, "flags": ["MALWARE"]},
		{"url": "http://example.org", "unsafe": false, "flags": []},
		{"url": "https://example.org", "unsafe": false, "flags": []},
		{"url": "https://www.example.org", "unsafe": false, "flags": []}
	]
}
```


## Rich Token Documents

Rich Token Documents are a standard format for safely expressing rich content.
While we could emit HTML, clients would need to do extra processing to ensure
the safety of the HTML and there would still be issues with certain missing
functionality, such as integration with client localization.

The root of a Rich Token Document is a `TOKEN`, and `TOKEN`s are a recursive
structure comprised of lists, `RICH_TOKEN`s, primitives, and `null`.

```javascript
TOKEN = [LIST, OF, TOKEN, ...] || RICH_TOKEN || PRIMITIVE || null;
PRIMITIVE = String || Number || Boolean;

RICH_TOKEN = {type: String, ...ARGS};
```

Primitives are cast to strings for inclusion in the output. If you require
special formatting of a number of string, you should use a rich token.
`null` produces no output from the client.


# Rich Token Types

## Box

```javascript
BOX_TOKEN = {
	type: "box",
	wrap: WRAP?,
	lines: Number?,
	pd: SPACING?,
	pd-t: SPACING?, pd-l: SPACING?, pd-r: SPACING?, pd-b: SPACING?,
	mg: SPACING?,
	mg-t: SPACING?, mg-l: SPACING?, mg-r: SPACING?, mg-b: SPACING?,

	content: TOKEN
}

SPACING = "small" || "normal" || "large" || "huge" || CSSNumber;
WRAP = "wrap" || "nowrap" || "wrap-reverse";
```

Box tokens are used to adding space around content. The `wrap` parameter
is for overriding how white space and line returns are handled within the
box's contents, acting as the CSS `white-space` attribute. If `lines` is
present, the content will be limited to a height of that many lines.

The `pd` and `mg` values are for adding padding and margins to the box,
respectively. The sub-values are for the top, left, right, and bottom
respectively.


## Conditional

```javascript
CONDITIONAL_TOKEN = {
	type: "cond",
	media: Boolean?,
	nsfw: Boolean?,
	content: TOKEN,
	alternative: TOKEN?
};
```

Conditional tokens allow a client to selectively hide content that the user has
indicated they do not wish to see. Specifically, the FrankerFaceZ client allows
users to indicate that they do not wish to see media in tool-tips, and separately
that they do not wish to see NSFW media in tool-tips.

If `media` is present, the block will be included if the value of `media` matches
the user's preference for including media. If `nsfw` is true, the block will be
included if the user has indicated a preference for seeing NSFW content.

If `alternative` is supplied and the content is not included, the alternative
content will be included instead. This can be used to, for example, indicate that
the content includes significant use of media.


## Fieldset

```javascript
FIELDSET_TOKEN = {
	type: 'fieldset',
	fields: [LIST, OF, FIELD...]
};

FIELD = {
	name: TOKEN,
	value: TOKEN,
	inline: Boolean?
}
```

Fieldsets make it quick to embed several distinct points quickly, while still
supporting rich content within them. The idea was taken from Discord's own embed
system. Example:
```json
{
	"type": "fieldset",
	"fields": [
		{"name": "HP", "value": 96, "inline": true},
		{"name": "MP", "value": 12, "inline": true},
		{"name": "Status", "value": "Poisoned"}
	]
}
```


## Flex

```javascript
FLEX_TOKEN = {
	type: "flex",
	direction: DIRECTION?, inline: Boolean?, overflow: OVERFLOW?,
	'align-content': ALIGN?, 'align-items': ALIGN?, 'align-self': ALIGN?,
	'justify-content': ALIGN?,
	pd: SPACING?,
	pd-t: SPACING?, pd-l: SPACING?, pd-r: SPACING?, pd-b: SPACING?,
	mg: SPACING?,
	mg-t: SPACING?, mg-l: SPACING?, mg-r: SPACING?, mg-b: SPACING?,
	content: TOKEN
};

ALIGN = "start" || "end" || "center" || "between" || "around";
DIRECTION = "column" || "row" || "column-reverse" || "row-reverse";
OVERFLOW = "hidden" || "auto";
SPACING = "small" || "normal" || "large" || "huge" || CSSNumber;
WRAP = "wrap" || "nowrap" || "wrap-reverse";
```

Flex tokens are used for layout control, with the assumption that all clients
will either be able to use flexbox to layout elements or will be able to
interpret the description and perform their own layout operations. It's pretty
much just a direct mapping of flex.

The `pd` and `mg` values are for adding padding and margins to the box,
respectively. The sub-values are for the top, left, right, and bottom
respectively.


## Format

```javascript
FORMAT_TOKEN = {
	type: 'format',
	format: String,
	value: Object || String || Boolean || Number || null,
	options: Object?
}
```

Format tokens are used to format a value on the client. This allows tokens
to be formatted according to the user's language and preferences.

`format` is the type of formatting to perform. The following choices
are available:

* `date`: Format the value as a date. (Ex: `02/03/2020`)
* `time`: Format the value as a time. (Ex: `03:12`)
* `datetime`: Format the value as a full date and time. (Ex: `02/03/2020, 03:12`)
* `relative`: Format the value as a time relative to the current time. (Ex: `4 hours ago`)
* `duration`: Format the value as a duration. Expects value to be in seconds. (Ex: `0:12:39`)
* `number`: Format the value as a number.

If `options` is supplied, it is passed to the formatter as an additional
argument. The `date`, `time`, and `datetime` formats support custom formats
for their output.


## Gallery

```javascript
GALLERY_TOKEN = {
	type: 'gallery',
	items: [LIST, OF, MEDIA, ...]
};

MEDIA = IMAGE_TOKEN || VIDEO_TOKEN;
```

Gallery tags are used for layout control when embedding one or more images or
videos, up to a maximum of four. Gallery tags limit the maximum size of the
embedded images and videos as appropriate and depending on the number it has
to display.


## Header

```javascript
HEADER_TOKEN = {
	type: "header",
	title: TOKEN, subtitle: TOKEN?, extra: TOKEN?,
	height: Number?, compact: Boolean?,
	image: IMAGE_TOKEN?, image_side: SIDE
};

SIDE = "left" || "right";
```

Header creates a section with an image next to one, two, or three lines of
formatted text. The image fills the height of the header. If a height is not
specified, the header will expand to contain its title, subtitle, and extra.
If height is specified, and the header is taller than its contents, the contents
will be vertically centered.

If `compact` is true, the title, subtitle, and extra will be rendered on one line.


## Icon

```javascript
ICON_TOKEN = {
	type: "icon",
	name: String
};
```

Icon tokens create an in-line icon. The name of the icon should be an existing
icon supported by the FrankerFaceZ client. You can find a list of the currently
supported icons here: [FrankerFaceZ:src/utilities/ffz-icons.js](https://github.com/FrankerFaceZ/FrankerFaceZ/blob/master/src/utilities/ffz-icons.js)



## Image

```javascript
IMAGE_TOKEN = {
	type: "image",
	url: URL, title: String?,
	aspect: Number?, width: Number?, height: Number?,
	sfw: Boolean?, rounding: Number?
};

URL = String || { dark: String, light: String };
```

Include an image. You can include either a single URL, or separate URLs with versions
of the image appropriate for use on light and dark backgrounds. A title, if set, will
be used as alt text for the image.

If `sfw` is present, then the image will only be included in output if either `sfw` is
true or the user has elected to view NSFW content. Please note that, generally
speaking, *all* content should be marked as NSFW unless it is explicitly known to be
SFW. When displaying user-generated content from websites, content should be assumed
to be NSFW unless the platform is well regulated.

`rounding` is optionally used to apply rounded corners to an image, and should be the
number of pixels by which you wish to round the corners. Use `-1` for a circle.


## I18N

```javascript
I18N_TOKEN = {
	type: "i18n",
	key: String, phrase: String,
	content: {...[key: TOKEN]}
};
```

Internationalization tokens provide for localizable content within rich documents.
The FrankerFaceZ client sends these through its i18n layer. The key is a namespaced
string describing the location of the translation within the greater FFZ user interface.
All keys should be structured as `embed.[resolver].[key]` where `resolver` is the
name of the resolver and `key` is a relevant description of the string being localized.

As an example, the Discord resolver uses the string `embed.discord.channel` for
translating the phrase `Channel: {name}`.

Phrases are written using the [ICU MessageFormat](https://format-message.github.io/icu-message-format-for-translators/) with support for all ICU MessageFormat features.

Content is an object, where the keys are the names of variables for injection into
the provided phrase where appropriate and the values are tokens.

Example:
```json
{
	"type": "i18n",
	"key": "embed.discord.channel",
	"phrase": "Channel: {name}",
	"content": {
		"name": {
			"type": "style", "weight": "semibold", "content": "#welcome-and-rules"
		}
	}
}
```


## Link

```javascript
LINK_TOKEN = {
	type: "link",
	url: String,
	content: TOKEN,
	interactive: Boolean?,
	tooltip: Boolean?,
	embed: Boolean?,
	no_color: Boolean?
};
```

Link tokens create links to external content. Links should open in new windows.
If `interactive` is true, the link should be styled like a button. The name is
taken from Twitch's `tw-interactive` classes.

If `tooltip` is false, then hovering over the link should not cause the client
to attempt to render a rich tooltip.

If `embed` is true, then the link should be rendered as an embed, as a block
with a border and spacing to separate it from its parent content. This will
likely be removed in favor of a mix of box tokens and `interactive` soon.

If `no_color` is true, then the link should inherit its color from its parent
rather than having a special color due to being a link.


## Overlay

```javascript
OVERLAY_TOKEN = {
	type: "overlay",
	content: TOKEN,
	top-left: TOKEN?, top: TOKEN? top-right: TOKEN?,
	left: TOKEN?, center: TOKEN?, right: TOKEN?,
	bottom-left: TOKEN?, bottom: TOKEN?, bottom-right: TOKEN?
};
```

Overlay tokens are for placing content in alignment above other content.
Typically, this is used for placing metadata above an image or video.

Content is the base content, and all other properties are for placing
content over the base content aligned to a specific side or corner.


## Style

```javascript
STYLE_TOKEN = {
	type: "style",
	weight: WEIGHT, italic: Boolean, strike: Boolean, underline: Boolean,
	tabular: Boolean, wrap: WRAP, size: SIZE, color: COLOR, ellipsis: Boolean,
	pd: SPACING?,
	pd-t: SPACING?, pd-l: SPACING?, pd-r: SPACING?, pd-b: SPACING?,
	mg: SPACING?,
	mg-t: SPACING?, mg-l: SPACING?, mg-r: SPACING?, mg-b: SPACING?,
	content: TOKEN
};

WEIGHT = "regular" || "bold" || "semibold" || Number;
WRAP = "nowrap" || "pre-wrap";
COLOR = "base" || "alt" || "alt-2" || "link" || CSSColor;
SPACING = "small" || "normal" || "large" || "huge" || CSSNumber;
SIZE = "1" || "2" || "3" || "4" || "5" || "6" || "7" || "8" || CSSNumber || Number;
```

Style tokens provide a somewhat platform-agnostic way of styling rich documents, as
opposed to directly specifying elements with specific CSS classes. In addition to,
they provide a bit of control over white space wrapping within their content and
they can have spacing added similarly to `box` and `flex`.

The `size` string values `"1"` through `"8"` refer to font sizes that match other
elements within the client. All other values will be interpreted as CSS measurements.
If a plain number is sent, it will be interpreted as a pixel count.


## Tag (Deprecated)

```javascript
TAG_TOKEN = {
	type: "tag",
	tag: String?, class: String?, title: String?, attrs: Object?,
	content: TOKEN
};
```

Face it. Sometimes you just need a bit of HTML. This should be your token of last
resort, and if you submit a pull request with this content, expect a lengthy back
and forth while we consider why you wanted to use this specifically and whether or
not we could improve the spec to eliminate your use case.

But, this is here for adding HTML elements. `tag` is the name of the HTML tag, and
it defaults to `span` if not specified. `tag` is limited to a permitted list of safe
tags, which may differ between clients. The official client permits the following
tags to be used:

> `a`, `abbr`, `article`, `aside`, `audio`, `b`, `bdi`, `bdo`, `blockquote`, `br`,
> `caption`, `code`, `col`, `colgroup`, `data`, `dd`, `div`, `dl`, `dt`, `em`,
> `figcaption`, `figure`, `footer`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `header`,
> `hr`, `i`, `img`, `li`, `main`, `nav`, `ol`, `p`, `picture`, `pre`, `s`, `section`,
> `source`, `span`, `strong`, `sub`, `sup`, `svg`, `table`, `tbody`, `td`, `tfoot`,
> `th`, `thead`, `time`, `tr`, `track`, `u`, `ul`, `video`, `wbr`

`class` is a space-separated list of CSS class names to apply to the element.

`attrs` is an object of attributes to set on the created element. This is limited to
a permitted list of safe attributes, which differ by tag name. Permitted attributes
may also differ by client. The official client permits the following tags to be
used with the respective tags:

* a: `href`, `title`
* audio: `autoplay`, `controls`, `loop`, `muted`, `preload`, `src`
* bdo: `dir`
* col: `span`
* colgroup: `span`
* data: `value`
* img: `alt`, `height`, `sizes`, `src`, `srcset`, `width`
* source: `src`, `srcset`, `sizes`, `type`, `media`
* td: `colspan`, `headers`, `rowspan`
* th: `abbr`, `colspan`, `headers`, `rowspan`, `scope`
* time: `datetime`
* track: `default`, `kind`, `label`, `src`, `srclang`
* video: `autoplay`, `controls`, `height`, `loop`, `muted`, `poster`, `preload`, `src`, `width`
