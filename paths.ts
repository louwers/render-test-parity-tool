import * as path from "node:path";

export const renderTestPathNative = "metrics/integration/render-tests";
export const maplibreNative = path.resolve("../maplibre-native", renderTestPathNative);
export const renderTestPathJs = "test/integration/render/tests";
export const maplibreJs = path.resolve("../maplibre-gl-js", renderTestPathJs);