var fuse;
var showButton = document.getElementById("search-button");
var showButtonMobile = document.getElementById("search-button-mobile");
var hideButton = document.getElementById("close-search-button");
var wrapper = document.getElementById("search-wrapper");
var modal = document.getElementById("search-modal");
var input = document.getElementById("search-query");
var output = document.getElementById("search-results");
var first = output.firstChild;
var last = output.lastChild;
var searchVisible = false;
var indexed = false;
var hasResults = false;

// Listen for events
showButton ? showButton.addEventListener("click", displaySearch) : null;
showButtonMobile ? showButtonMobile.addEventListener("click", displaySearch) : null;
hideButton.addEventListener("click", hideSearch);
wrapper.addEventListener("click", hideSearch);
modal.addEventListener("click", function (event) {
  event.stopPropagation();
  event.stopImmediatePropagation();
  return false;
});
document.addEventListener("keydown", function (event) {
  // Forward slash to open search wrapper
  if (event.key == "/") {
    const active = document.activeElement;
    const tag = active.tagName;
    const isInputField = tag === "INPUT" || tag === "TEXTAREA" || active.isContentEditable;

    if (!searchVisible && !isInputField) {
      event.preventDefault();
      displaySearch();
    }
  }

  // Esc to close search wrapper
  if (event.key == "Escape") {
    hideSearch();
  }

  // Down arrow to move down results list
  if (event.key == "ArrowDown") {
    if (searchVisible && hasResults) {
      event.preventDefault();
      if (document.activeElement == input) {
        first.focus();
      } else if (document.activeElement == last) {
        last.focus();
      } else {
        document.activeElement.parentElement.nextSibling.firstElementChild.focus();
      }
    }
  }

  // Up arrow to move up results list
  if (event.key == "ArrowUp") {
    if (searchVisible && hasResults) {
      event.preventDefault();
      if (document.activeElement == input) {
        input.focus();
      } else if (document.activeElement == first) {
        input.focus();
      } else {
        document.activeElement.parentElement.previousSibling.firstElementChild.focus();
      }
    }
  }

  // Enter to get to results
  if (event.key == "Enter") {
    if (searchVisible && hasResults) {
      event.preventDefault();
      if (document.activeElement == input) {
        first.focus();
      } else {
        document.activeElement.click();
      }
    }
  }
});

// Update search on each keypress
input.onkeyup = function (event) {
  executeQuery(this.value);
};

function displaySearch() {
  if (!indexed) {
    buildIndex();
  }
  if (!searchVisible) {
    document.body.style.overflow = "hidden";
    wrapper.style.visibility = "visible";
    input.focus();
    searchVisible = true;
  }
}

function hideSearch() {
  if (searchVisible) {
    document.body.style.overflow = "visible";
    wrapper.style.visibility = "hidden";
    input.value = "";
    output.innerHTML = "";
    document.activeElement.blur();
    searchVisible = false;
  }
}

function fetchJSON(path, callback) {
  var httpRequest = new XMLHttpRequest();
  httpRequest.onreadystatechange = function () {
    if (httpRequest.readyState === 4) {
      if (httpRequest.status === 200) {
        var data = JSON.parse(httpRequest.responseText);
        if (callback) callback(data);
      }
    }
  };
  httpRequest.open("GET", path);
  httpRequest.send();
}

function buildIndex() {
  var baseURL = wrapper.getAttribute("data-url");
  baseURL = baseURL.replace(/\/?$/, "/");
  fetchJSON(baseURL + "index.json", function (data) {
    var options = {
      shouldSort: true,
      ignoreLocation: true,
      threshold: 0.0,
      includeMatches: true,
      keys: [
        { name: "title", weight: 0.8 },
        { name: "section", weight: 0.2 },
        { name: "summary", weight: 0.6 },
        { name: "content", weight: 0.4 },
      ],
    };
    fuse = new Fuse(data, options);
    indexed = true;
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightMatches(text, matches, key) {
  if (!matches || !text) return escapeHtml(text || "");
  const match = matches.find(function (m) { return m.key === key; });
  if (!match) return escapeHtml(text);

  var indices = match.indices.slice().sort(function (a, b) { return a[0] - b[0]; });
  var result = "";
  var lastIndex = 0;

  for (var i = 0; i < indices.length; i++) {
    var start = indices[i][0];
    var end = indices[i][1];
    if (start < lastIndex) continue;
    result += escapeHtml(text.slice(lastIndex, start));
    result +=
      '<mark class="search-highlight">' +
      escapeHtml(text.slice(start, end + 1)) +
      "</mark>";
    lastIndex = end + 1;
  }
  result += escapeHtml(text.slice(lastIndex));
  return result;
}

function executeQuery(term) {
  let results = fuse.search(term);
  let resultsHTML = "";

  if (results.length > 0) {
    results.forEach(function (value, key) {
      var html = value.item.summary;
      var div = document.createElement("div");
      div.innerHTML = html;
      var plainSummary = div.textContent || div.innerText || "";

      var highlightedTitle = highlightMatches(value.item.title, value.matches, "title");
      var highlightedSummary = highlightMatches(plainSummary, value.matches, "summary");

      if (value.item.externalUrl) {
        highlightedTitle +=
          '<span class="text-xs ml-2 align-center cursor-default text-neutral-400 dark:text-neutral-500">' +
          escapeHtml(value.item.externalUrl) +
          "</span>";
      }

      var linkconfig = value.item.externalUrl
        ? 'target="_blank" rel="noopener" href="' + value.item.externalUrl + '"'
        : 'href="' + value.item.permalink + '"';

      resultsHTML =
        resultsHTML +
        `<li class="mb-2">
          <a class="flex items-center px-3 py-2 rounded-md appearance-none bg-neutral-100 dark:bg-neutral-700 focus:bg-primary-100 hover:bg-primary-100 dark:hover:bg-primary-900 dark:focus:bg-primary-900 focus:outline-dotted focus:outline-transparent focus:outline-2"
          ${linkconfig} tabindex="0">
            <div class="grow">
              <div class="-mb-1 text-lg font-bold">
                ${highlightedTitle}
              </div>
              <div class="text-sm text-neutral-500 dark:text-neutral-400">${value.item.section}<span class="px-2 text-primary-500">&middot;</span>${value.item.date ? value.item.date : ""}</span></div>
              <div class="text-sm italic">${highlightedSummary}</div>
            </div>
            <div class="ml-2 ltr:block rtl:hidden text-neutral-500">&rarr;</div>
            <div class="mr-2 ltr:hidden rtl:block text-neutral-500">&larr;</div>
          </a>
        </li>`;
    });
    hasResults = true;
  } else {
    resultsHTML = "";
    hasResults = false;
  }

  output.innerHTML = resultsHTML;
  if (results.length > 0) {
    first = output.firstChild.firstElementChild;
    last = output.lastChild.firstElementChild;
  }
}
