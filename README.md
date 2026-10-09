# holo-cards

Holographic trading cards in React.

## Credit

The card effect is the work of **Simon Goellner** ([@simeydotme](https://github.com/simeydotme)):
[pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css), licensed GPL-3.0.
The foils, the pointer maths and the spring settings are his. This repository is a port
of it, built from commit `acb1197`. Thank you, Simon.

`spring.ts` is a port of the `spring` store from [Svelte](https://github.com/sveltejs/svelte)
(MIT).

## What is here

| File | What it is |
|---|---|
| `src/HoloCard.tsx` | React port of `Card.svelte`: springs, tilt, glare, close-up and turning over. The changes from the original are listed at the top of the file. |
| `src/spring.ts` | The spring store the card moves with. |
| `src/css/` | The original stylesheets for the foils used (V, cosmos, rainbow alt, regular holo, secret rare, radiant), with changes noted at the top of each file. |
| `src/holo-lab.css` | How the card sits in the page: sizing, the flat face (see below), dealing from a deck, the card back. |

The card face is any HTML passed to `HoloCard` as `front`. The textures the foils use
(`/img/holo/*`) are in the original repository's `public/img/`.

## One fix worth knowing

The original makes every layer of the card face (foil, glare, picture) its own plane in the
card's 3D space, each hiding its reverse side. In Chrome 155, while several cards tilted,
a card would sometimes lose layers for a frame: only the foil, a grey box, or nothing.
Rendering the face as one flat plane (`holo-lab.css`, "The face is one flat plane") ended it:
16 broken frames in 4 runs before, 0 in 12 runs after.

## Licence

GPL-3.0, the same as the original. See [`LICENSE`](LICENSE).
