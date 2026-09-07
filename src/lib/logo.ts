/**
 * BAYT-logotypen finns i två varianter, och valet styrs av *underlaget* —
 * aldrig av vilken sida det är.
 *
 *   LOGO_ON_DARK  — ljus ordbild med grönt hus. Sidopanelen, inloggningen,
 *                   demo-/startsidorna, de publika mörkgröna skärmarna.
 *   LOGO_ON_LIGHT — grön ordbild. Vita kort och ljusa ytor, och all e-post
 *                   (mejlklienter renderar mot vitt).
 *
 * Båda filerna är färdiga för sitt underlag. Lägg därför aldrig tillbaka ett
 * `filter: brightness(0) invert(1)` på en <img> med logotypen: det plattar ut
 * hela bilden till en enda färg och äter upp det gröna huset i mitten, som är
 * det enda som skiljer märket från vilken ordbild som helst.
 */
export const LOGO_ON_DARK = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;
export const LOGO_ON_LIGHT = `${import.meta.env.BASE_URL}assets/bayt-logo-green.png`;
