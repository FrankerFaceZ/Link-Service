'use strict';

import Resolver from '../resolver';
import { UseMetadata } from '../results';
import { i18nToken, linkToken, styleToken, galleryToken, overlayToken, imageToken, boxToken, refToken, formatToken } from '../builder';
import dayjs from 'dayjs';

const EMOTE_URL = /^\/emotes\/([0-9A-Z]+)/i,
  LOGO_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgZmlsbD0ibm9uZSI+PHBhdGggZD0ibTkwLjk4NiA0NS45NTMgNC45MzQtOC42MDMgMi42NjQtNC41NDktNC45MzQtOC42MDNWMjRINjcuMzA0bDkuODY3IDE3LjIwNiAyLjc2MyA0Ljc0N3ptLTU0LjM3IDU3Ljc1IDI5LjYwMi01MS42MTkgMy42NTEtNi4zMjktOS44NjctMTcuMjA2LTIuNzYzLTQuNDVIMTUuNTk4bC00LjkzNCA4LjYwM0w4IDM3LjI1MWw0LjkzNCA4LjYwM3YuMTk4SDQ0LjUxTDE5Ljg0IDg5LjA2OGwtMy40NTQgNi4xMzEgNC45MzQgOC42MDNWMTA0aDE1LjI5NW00MS4yNDctLjI5N2gxNS4wOTdsMTkuNzM1LTM0LjQxMyAzLjQ1NC01LjkzMy00LjkzNC04LjYwM3YtLjE5OEg5Ni4wMThsLTkuODY3IDE3LjIwNi0uNjkxIDEuMjg2LTkuODY4LTE3LjIwNi0uNjktMS4yODYtOS44NjggMTcuMjA2LTIuNzYyIDQuNzQ3IDE0LjggMjUuODA5eiIgZmlsbD0iIzI5YjZmNiIvPjwvc3ZnPg==',
  API_SERVER = 'https://7tv.io';

export default class SevenTV extends Resolver {

  transformURL(url, ctx) {
    const match = EMOTE_URL.exec(url.pathname);
    if (match) {
      const emote_id = ctx.emote_id = match[1];
      ctx.cache_key = `7tv-emote-${emote_id}`;
      return `${API_SERVER}/v3/emotes/${emote_id}`;
    }

    return UseMetadata;
  }

  processBody(data) {
    if (!data || !data.id || !data.name || !data.host || !data.owner) return;

    const flags = data.flags || 0,
      isPrivate = flags & 1,
      isOverlaying = flags & 256,
      isUnlisted = !data.listed,
      isApproved = data.listed;

    const baseURL = data.host.url;
    const files = data.host.files || [];

    let imageFile = files
      .filter(f => f.format === 'WEBP')
      .sort((a, b) => b.width - a.width)[0];

    if (!imageFile) return;

    const image = `${baseURL}/${imageFile.name}`;
    const aspect = imageFile.width / imageFile.height;

    const user = linkToken(
      `https://7tv.app/users/${data.owner.id}`,
      styleToken({ weight: 'semibold' }, data.owner.display_name)
    );

    const preview_image = boxToken({ pd: 'large' },
      imageToken(
        image,
        { sfw: isApproved }
      )
    );

    const visibilityFlags = [];
    if (isOverlaying) {
      visibilityFlags.push(' • ');
      visibilityFlags.push(i18nToken('overlaying', 'Overlaying'));
    }

    if (isPrivate) {
      visibilityFlags.push(' • ');
      visibilityFlags.push(i18nToken('private', 'Private'));
    }

    if (isUnlisted) {
      visibilityFlags.push(' • ');
      visibilityFlags.push(i18nToken('unlisted', 'Unlisted'));
    }

    const created = data.versions?.[0]?.createdAt
      ? dayjs(data.versions[0].createdAt)
      : null;

    return {
      v: 6,
      accent: '#29b6f6',
      i18n_prefix: 'embed.7tv',
      fragments: {
        preview: preview_image
      },

      short: this.builder()
        .setLogo(image, { sfw: isApproved, aspect: aspect })
        .setSFWLogo(LOGO_URL, { sfw: true, aspect: 1 })
        .setTitle(data.name)
        .setSubtitle([
          imageToken(LOGO_URL, {
            height: '18px',
            verticalAlign: 'text-bottom',
            sfw: true
          }),
          '7TV ',
          i18nToken('emote', 'Emote'),
          ' • ',
          i18nToken('by-line', 'By: {user}', {
            user
          }),
          ...visibilityFlags
        ]),

      full: this.builder()
        .setLogo(LOGO_URL, { sfw: true, aspect: 1 })
        .setTitle(data.name)
        .setSubtitle([
          '7TV ',
          i18nToken('emote', 'Emote'),
          ...visibilityFlags
        ])
        .addConditional(true, isApproved ? undefined : true,
          galleryToken([
            overlayToken(
              refToken('preview'),
              {},
              {
                background: '#191919'
              }
            ),
            overlayToken(
              refToken('preview'),
              {},
              {
                background: '#f2f2f2'
              }
            )
          ])
        )
        .addField(i18nToken('uploader', 'Uploader:'), user, true)
        .setFooter(null, [
          imageToken(LOGO_URL, {
            height: '16px',
            verticalAlign: 'text-top',
            sfw: true
          }),
          ' 7TV',
          ' • ',
          formatToken('datetime', created)
        ], null, { compact: true })
    }
  }

}

SevenTV.hosts = ['7tv.app'];
SevenTV.examples = [
  { title: 'Home Page', url: 'https://7tv.app' },
  { title: 'Emote', url: 'https://7tv.app/emotes/60ae7316f7c927fad14e6ca2' },
  { title: 'User', url: 'https://7tv.app/users/60c5600515668c9de42e6d69' }
]