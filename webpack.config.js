import path from "node:path";
import CopyPlugin from "copy-webpack-plugin";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";

export default {
  entry: "./src/scripts/module.ts",
  devtool: "source-map",
  experiments: { outputModule: true },
  output: {
    path: path.resolve("dist"),
    filename: "handy-dandy.js",
    library: { type: "module" }
  },
  module: {
    rules: [{ test: /\.ts$/, use: "ts-loader", exclude: /node_modules/ }]
  },
  plugins: [
    new CopyPlugin({ patterns: [{ from: "static", to: "." }] }),
    new ForkTsCheckerWebpackPlugin()
  ],
  resolve: { extensions: [".ts", ".js"] }
};
