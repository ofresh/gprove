/*
 * UAKino торенти — плагін для Lampa.
 * Додає кнопку «UAKino» на картку фільму/серіалу: шукає торенти uakino.best
 * через парсер (server.js з цього репозиторію) і запускає їх у TorrServer.
 *
 * Найпростіше встановлення: у Lampa → Налаштування → Розширення → Додати плагін
 * вкажіть http://<IP-парсера>:9118/uakino.js — адреса парсера підставиться сама.
 */
(function () {
  'use strict';

  if (window.uakino_torrents_plugin) return;
  window.uakino_torrents_plugin = true;

  // Сервер замінює цей рядок своєю адресою, коли віддає плагін за /uakino.js
  var BUILT_IN_SERVER = '__UAKINO_SERVER__';
  if (BUILT_IN_SERVER.indexOf('__') === 0) BUILT_IN_SERVER = '';

  var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2 3 6v6c0 5 3.8 9.7 9 10 5.2-.3 9-5 9-10V6l-9-4Zm0 4.2 2 4.3H10l2-4.3ZM8 12h8l-4 6-4-6Z"/></svg>';

  function serverUrl() {
    var s = Lampa.Storage.get('uakino_server', '') || BUILT_IN_SERVER;
    s = String(s).trim().replace(/\/+$/, '');
    if (s && !/^https?:\/\//i.test(s)) s = 'http://' + s;
    return s;
  }

  function enc(v) {
    return encodeURIComponent(v || '');
  }

  function searchUrl(movie) {
    var title = movie.title || movie.name || '';
    var original = movie.original_title || movie.original_name || '';
    var date = movie.release_date || movie.first_air_date || '';
    var key = Lampa.Storage.get('uakino_apikey', '');
    return serverUrl() + '/api/v2.0/indexers/uakino/results' +
      '?apikey=' + enc(key) +
      '&Query=' + enc(title || original) +
      '&title=' + enc(title) +
      '&title_original=' + enc(original) +
      '&year=' + enc(String(date).slice(0, 4)) +
      '&is_serial=' + (movie.name || movie.first_air_date ? 2 : 1);
  }

  function bytes(size) {
    if (!size) return '';
    if (Lampa.Utils && Lampa.Utils.bytesToSize) return Lampa.Utils.bytesToSize(size);
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
    return (size / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
  }

  function prepare(element) {
    element.size = bytes(element.Size);
    if (Lampa.Utils && Lampa.Utils.hash) element.hash = Lampa.Utils.hash(element.Title);
    if (Lampa.Utils && Lampa.Utils.strToTime && element.PublishDate) element.PublisTime = Lampa.Utils.strToTime(element.PublishDate);
    return element;
  }

  function play(element, movie) {
    if (Lampa.Torrent && typeof Lampa.Torrent.start === 'function') {
      Lampa.Torrent.start(element, movie);
    } else {
      Lampa.Noty.show('Ця версія Lampa не підтримує запуск торентів з плагіна');
    }
  }

  var network = null;

  function stopLoading() {
    if (Lampa.Loading && Lampa.Loading.stop) Lampa.Loading.stop();
  }

  function open(movie) {
    if (!serverUrl()) {
      Lampa.Noty.show('Вкажіть адресу парсера UAKino: Налаштування → UAKino');
      return;
    }

    var controller = Lampa.Controller.enabled().name;
    if (network) network.clear();
    network = new Lampa.Reguest();
    network.timeout(120000);

    if (Lampa.Loading && Lampa.Loading.start) {
      Lampa.Loading.start(function () {
        network.clear();
        stopLoading();
        Lampa.Controller.toggle(controller);
      });
    }

    network.silent(searchUrl(movie), function (json) {
      stopLoading();
      var results = (json && json.Results) || [];
      if (!results.length) {
        Lampa.Noty.show('На UAKino торентів не знайдено');
        Lampa.Controller.toggle(controller);
        return;
      }

      var items = results.map(function (r) {
        var info = [];
        if (r.Size) info.push(bytes(r.Size));
        if (r.Files) info.push(r.Files + ' файл.');
        info.push('▲ ' + (r.Seeders || 0));
        info.push('▼ ' + (r.Peers || 0));
        return { title: r.Title, subtitle: info.join(' • '), torrent: prepare(r) };
      });

      Lampa.Select.show({
        title: 'UAKino — торенти',
        items: items,
        onSelect: function (item) {
          Lampa.Controller.toggle(controller);
          play(item.torrent, movie);
        },
        onBack: function () {
          Lampa.Controller.toggle(controller);
        }
      });
    }, function (a, c) {
      stopLoading();
      var err = network.errorDecode ? network.errorDecode(a, c) : 'помилка запиту';
      if (a && a.responseJSON && a.responseJSON.error) err = a.responseJSON.error;
      Lampa.Noty.show('UAKino: ' + err);
      Lampa.Controller.toggle(controller);
    });
  }

  function addButton(e) {
    var render = e.object.activity.render();
    if (render.find('.view--uakino').length) return;

    var button = $('<div class="full-start__button selector view--uakino">' + ICON + '<span>UAKino</span></div>');
    button.on('hover:enter', function () {
      open(e.data.movie);
    });

    var torrent = render.find('.view--torrent');
    if (torrent.length) torrent.after(button);
    else render.find('.full-start-new__buttons, .full-start__buttons').first().append(button);

    // Оновлюємо навігацію, щоб кнопка стала доступною з пульта.
    if (Lampa.Controller.enabled().name === 'full_start') Lampa.Controller.toggle('full_start');
  }

  function addSettings() {
    if (!Lampa.SettingsApi) return;
    Lampa.SettingsApi.addComponent({ component: 'uakino', name: 'UAKino', icon: ICON });
    Lampa.SettingsApi.addParam({
      component: 'uakino',
      param: { name: 'uakino_server', type: 'input', values: '', default: '', placeholder: BUILT_IN_SERVER || 'http://192.168.1.10:9118' },
      field: {
        name: 'Адреса парсера',
        description: BUILT_IN_SERVER ? 'За замовчуванням: ' + BUILT_IN_SERVER : 'Адреса, де запущено server.js (порт 9118)'
      }
    });
    Lampa.SettingsApi.addParam({
      component: 'uakino',
      param: { name: 'uakino_apikey', type: 'input', values: '', default: '', placeholder: '' },
      field: { name: 'API-ключ', description: 'Лише якщо на парсері задано UAKINO_APIKEY' }
    });
  }

  function start() {
    addSettings();
    Lampa.Listener.follow('full', function (e) {
      if (e.type === 'complite') addButton(e);
    });
  }

  if (window.appready) start();
  else {
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') start();
    });
  }
})();
