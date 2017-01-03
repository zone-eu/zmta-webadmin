var elms = document.querySelectorAll('.datestring');
var elm;
var date;

for (var i = 0, len = elms.length; i < len; i++) {
    elm = elms[i];
    if (elm.title && elm.title.length === 24) {
        elm.textContent = moment(elm.title).format('YYYY/MM/DD hh:mm:ss');
    }
}
