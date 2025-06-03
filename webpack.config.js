import path from "node:path";
import CopyPlugin from "copy-webpack-plugin";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import fs from "node:fs";

// Read package.json values
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));

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
    new CopyPlugin({
      patterns: [
        {
          from: "src/static/module.json",
          to: ".",
          transform(content) {
            return content
              .toString()
              .replace(/<%= id %>/g, packageJson.name)
              .replace(/<%= version %>/g, packageJson.version);
          }
        },
        {
          from: "src/templates",
          to: "templates"
        },
        {
          from: "src/styles",
          to: "styles"
        }
      ]
    }),
    new ForkTsCheckerWebpackPlugin()
  ],
  resolve: { extensions: [".ts", ".js"] }
};