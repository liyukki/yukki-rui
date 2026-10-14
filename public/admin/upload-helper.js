/**
 * 「选择本地图片」上传助手（站点后台专用）。
 *
 * 为什么需要它：部分内置 / 内嵌浏览器不支持把系统文件拖进网页，
 * Decap 媒体库的拖拽上传在这种环境里会静默失效。本脚本在媒体库弹窗
 * 打开时注入一个显眼的浮动按钮，点击后直接触发 Decap 自带的文件输入
 * （与弹窗右上角 Upload 按钮是同一个 input），之后的选取、上传、落盘、
 * 插入流程完全复用 Decap 自己的管道，行为与手动点击 Upload 完全一致。
 *
 * 实现刻意不碰 Decap 的 React 组件：只用 MutationObserver 观察弹窗里的
 * 原生 file input（.nc-fileUploadButton input）是否存在，来决定挂载 / 移除
 * 按钮。Decap 升级换类名时还有 accept 含 image 的兜底查找。
 */
(function () {
  var BUTTON_ID = 'local-pick-helper';

  function findUploadInput() {
    var scoped = document.querySelectorAll('.nc-fileUploadButton input[type=file]');
    if (scoped.length) return scoped[scoped.length - 1];
    // 兜底：任何 accept 含 image 的文件输入（类名变化时仍可用）
    var all = document.querySelectorAll('input[type=file]');
    for (var i = all.length - 1; i >= 0; i -= 1) {
      var accept = all[i].getAttribute('accept') || '';
      if (accept.indexOf('image') !== -1) return all[i];
    }
    return null;
  }

  function remove() {
    var btn = document.getElementById(BUTTON_ID);
    if (btn) btn.remove();
  }

  function ensure() {
    var input = findUploadInput();
    if (!input) {
      remove();
      return;
    }
    if (document.getElementById(BUTTON_ID)) return;

    var btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.textContent = '📁 选择本地图片';
    btn.title = '打开系统文件选择框，选择一张图片上传（拖拽不可用时请点这里）';
    btn.setAttribute(
      'style',
      [
        'position:fixed',
        'right:22px',
        'bottom:22px',
        'z-index:2147483647',
        'padding:13px 20px',
        'font:700 15px/1 system-ui,"Segoe UI","Microsoft YaHei",sans-serif',
        'color:#352640',
        'background:#f7c455',
        'border:2px solid #352640',
        'border-radius:2px',
        'box-shadow:4px 4px 0 #352640',
        'cursor:pointer',
      ].join(';'),
    );
    // 点击发生在用户手势里，input.click() 会正常打开系统文件选择框。
    btn.addEventListener('click', function () {
      var current = findUploadInput();
      if (current) current.click();
    });
    document.body.appendChild(btn);
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      ensure();
    }, 60);
  }

  function start() {
    ensure();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
