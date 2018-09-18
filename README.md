# Dev Project for .cps files
This is a small test project for trying if `.cps` files support being coded in ES7 and later transpiled to ES5 supported `JavaScript`

## How?

Download [nodejs](www.nodejs.org)

Install `yarn` with `npm install -g yarn`

In project root, run `yarn` to install dependencies.

## Develop?

In `src/` folder, you have the source. Build it with `yarn build` in project root.
If you are developing and want to see potential build errors in run-time, run `yarn watch`

## Production ready?

In the `dist/` folder you have the transpiled source, that means you can access powerfull ES7 features in your `src/` code. This transpiled source
is not considered human readable (even if it is for some).

You create the built and ready file with `yarn build`.
