# Render Test Parity Tool

Generates [render test parity status report](https://gist.github.com/louwers/0259c83872da7093670627a43f32b4a1) for MapLibre.

```
echo "GITHUB_TOKEN=..." >> .env
echo "GIST_ID=..." >> .env

npm install
npm run check
```

## Copy render tests

Easily copy render tests with for example:

```
npm run copy from-js text-breaking
```

Or the other way around:

```
npm run copy from-native text-breaking
```

The paths need to be set in `paths.ts`.