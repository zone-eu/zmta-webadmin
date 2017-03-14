function updateDatestrings() {
    var elms = document.querySelectorAll('.datestring');
    var elm;

    for (var i = 0, len = elms.length; i < len; i++) {
        elm = elms[i];
        if (elm.title && elm.title.length === 24) {
            elm.textContent = moment(elm.title).format('YYYY-MM-DD HH:mm:ss');
        }
    }
}

function updateRelativeDatestrings() {
    var elms = document.querySelectorAll('.datestring-relative');
    var elm;

    for (var i = 0, len = elms.length; i < len; i++) {
        elm = elms[i];
        if (elm.title && elm.title.length === 24) {
            elm.textContent = moment(elm.title).fromNow();
        }
    }
}

updateDatestrings();
updateRelativeDatestrings();

setInterval(updateRelativeDatestrings, 10 * 1000);
