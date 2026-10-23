// Injects the shared header and footer into static pages.
// Pages that include <header id="site-header"> and <footer id="site-footer"> get the same navigation.
(function () {
  var page = (location.pathname.split("/").pop() || "index.html");
  var links = [
    ["index.html", "Home"],
    ["about.html", "About"],
    ["support.html", "Support"],
    ["app.html", "Study app"]
  ];
  var header = document.getElementById("site-header");
  if (header) {
    var nav = links.map(function (l) {
      var current = page === l[0] ? ' aria-current="page"' : "";
      return '<a href="' + l[0] + '"' + current + ">" + l[1] + "</a>";
    }).join("");
    header.innerHTML =
      '<div class="bar">' +
        '<a class="logo" href="index.html"><span class="logo-mark" aria-hidden="true">✦</span> Floxovo</a>' +
        '<nav aria-label="Site">' + nav + '<a href="app.html#login">Sign in</a></nav>' +
      "</div>";
    header.classList.add("site-head");
  }
  var footer = document.getElementById("site-footer");
  if (footer) {
    footer.className = "site-foot";
    footer.innerHTML =
      '<div><a href="about.html">About</a> · <a href="support.html">Support</a> · <a href="privacy.html">Privacy Policy</a> · ' +
      '<a href="terms.html">Terms of Service</a> · <a href="cookies.html">Cookie Policy</a> · <a href="acceptable-use.html">Acceptable Use</a></div>' +
      '<div class="fine">© ' + new Date().getFullYear() + ' Floxovo. Made for learners everywhere.</div>';
  }
})();
