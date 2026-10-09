export default {
  ignoreFiles: ["**/tokens.css", "**/node_modules/**", "**/dist/**"],
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
  },
};
