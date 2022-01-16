'use strict';

import Resolver from '../resolver';

const RARITY_NAMES = ['common', 'uncommon', 'rare', 'super', 'ultra', 'legendary', 'mythical', 'god', 'special', 'promo'];

export default class WaifuTCG extends Resolver {
	transformURL(url, ctx) {
		ctx.type = url.pathname.replace('/', '');
		ctx.tcguser = url.searchParams.get('user');
		switch (url.pathname) {

			case '/booster':
				// booster Data is highly volatile and should not be cached - Cache busting may be implemented in the link service in the future
			// eslint-disable-next-line no-fallthrough
			case '/hand':
			case '/pullfeed': {
				ctx.headers = {
					'Accept': 'application/json'
				};
				ctx.parse = 'json';
			}
			// eslint-disable-next-line no-fallthrough
			case '/':
			case '/profile': // I really thought i had implemented application/json for /profile, but I guess i did not.
			case '/rules':
			case '/discord':
			default: {
				return url.href;
			}
		}
	}

	processBody(data, mode, ctx) {
		let title = `${data.user ? data.user : ctx.tcguser}'s Waifu TCG ${ctx.type}`;
		if (ctx.type === 'pullfeed') {
			title = 'Waifu TCG Pullfeed';
		}
		const returnobject = {
			'v': 5,
			'accent': '#8F6AD3D8',
			'short': {
				'type': 'header',
				title,
				'image': {
					'type': 'image',
					'url': 'https://cdn.discordapp.com/icons/536128175399501824/2c63c6179e78e9d4afa4881b3d25f39c.png',
					'sfw': true
				}
			},
			'unsafe': false,
			'urls': [
				{
					'url': ctx.url,
					'unsafe': false,
					'flags': []
				}
			]
		};
		if (data.error && data.error.status === 404) {
			returnobject.short.subtitle = ctx.type === 'booster' ? 'No Booster found - buy one!' : 'User not found, sorry';
		} else {
			returnobject.full = [
				returnobject.short,
				null,
				{
					'type': 'conditional',
					'media': true,
					'nsfw': true,
					'content': {
						'type': 'gallery',
						'items': []
					}
				}
			];
			switch (ctx.type) {
				case 'booster':
				case 'hand': {
					const len = data.cards.length;
					const rarities = Array(10).fill(0);
					returnobject.short.subtitle = `${len} cards`;
					const firstFewImages = [];
					for (const card of data.cards) {
						rarities[card.rarity] += 1;
						if (firstFewImages.length < 4) {
							firstFewImages.push(card.image);
						}
					}
					let currentRarity = -1;
					for (const rarity of rarities) {
						currentRarity++;
						if (rarity !== 0) {
							returnobject.short.subtitle += `, ${rarity} ${RARITY_NAMES[currentRarity]}`;
						}
					}
					for (const image of firstFewImages) {
						returnobject.full[2].content.items.push({
							'type': 'image',
							'url': image
						});
					}
				}
			}
		}
		return returnobject

	}

	processHeaders(request, ctx) {
		switch (ctx.type) {
			case '':
			default: {
				ctx.response = {
					'v': 5,
					'accent': '#8F6AD3D8',
					'short': {
						'type': 'header',
						'title': 'Waifu TCG',
						'subtitle': 'Collect and Trade your favourite Waifus!',
						'image': {
							'type': 'image',
							'url': 'https://cdn.discordapp.com/icons/536128175399501824/2c63c6179e78e9d4afa4881b3d25f39c.png',
							'sfw': true
						}
					},
					'unsafe': false
				}
				return false;
			}
			case 'booster':
			case 'hand':
			case 'pullfeed':
			case 'profile':
				return true
		}
	}

}
WaifuTCG.hosts = ['waifus.de'];
WaifuTCG.examples = [
	{
		title: 'Rules Page',
		url: 'https://waifus.de/rules'
	},
	{
		title: 'Discord Link',
		url: 'https://waifus.de/discord'
	},
	{
		title: 'Hand Page',
		url: 'https://waifus.de/hand?user=marenthyu'
	},
	{
		title: 'Booster Page',
		url: 'https://waifus.de/booster?user=marenthyu'
	}
]
