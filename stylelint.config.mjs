export default {
  ignoreFiles: ["**/tokens.css", "**/node_modules/**", "**/dist/**"],
  plugins: ["stylelint-no-unsupported-browser-features"],
  rules: {
    "color-no-hex": true,
    "color-named": "never",
    "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla"],
    "unit-disallowed-list": [
      ["px", "rem", "em"],
      { ignoreMediaFeatureNames: { px: ["max-width", "min-width"] } },
    ],
    "declaration-property-value-disallowed-list": {
      "font-weight": ["/^\\d/"],
    },
    "plugin/no-unsupported-browser-features": [
      true,
      {
        severity: "error",
        ignorePartialSupport: true,
        ignore: [
          "css3-cursors",
          "css3-cursors-grab",
          "css-scrollbar",
          "css-resize",
          "css-touch-action",
        ],
      },
    ],
  },
};
