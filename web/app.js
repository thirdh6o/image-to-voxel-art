const form = document.querySelector('#convertForm');
const statusPill = document.querySelector('#statusPill');
const downloadLink = document.querySelector('#downloadLink');
const downloadEmpty = document.querySelector('#downloadEmpty');
const htmlFile = document.querySelector('#htmlFile');
const exampleSelect = document.querySelector('#exampleSelect');
const uploadField = document.querySelector('#uploadField');
const exampleField = document.querySelector('#exampleField');
const formatSelect = document.querySelector('#formatSelect');
const maxEdgeInput = document.querySelector('#maxEdgeInput');
const outputNameInput = document.querySelector('#outputNameInput');
const dropzone = document.querySelector('#dropzone');
const dropzoneTitle = document.querySelector('#dropzoneTitle');
const dropzoneMeta = document.querySelector('#dropzoneMeta');
const segments = [...document.querySelectorAll('.segment')];

let mode = 'upload';
let selectedUpload = null;

function setStatus(text, tone = 'idle') {
  statusPill.textContent = text;
  statusPill.className = 'status-pill';
  if (tone === 'busy') statusPill.classList.add('is-busy');
  if (tone === 'done') statusPill.classList.add('is-done');
  if (tone === 'error') statusPill.classList.add('is-error');
}

function updateMode(nextMode) {
  mode = nextMode;
  for (const button of segments) {
    button.classList.toggle('is-active', button.dataset.mode === nextMode);
  }
  uploadField.classList.toggle('hidden', nextMode !== 'upload');
  exampleField.classList.toggle('hidden', nextMode !== 'example');
  setStatus(nextMode === 'upload' ? '等待上传' : '等待选择示例');
}

function setSelectedUpload(file) {
  selectedUpload = file || null;
  if (selectedUpload) {
    dropzoneTitle.textContent = selectedUpload.name;
    dropzoneMeta.textContent = '文件已就绪，点击开始转换。';
    setStatus('文件已就绪');
  } else {
    dropzoneTitle.textContent = '拖拽 HTML 到这里';
    dropzoneMeta.textContent = '或点击选择文件';
  }
}

async function loadExamples() {
  const response = await fetch('/api/examples');
  const data = await response.json();
  exampleSelect.innerHTML = '';
  for (const name of data.examples || []) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    exampleSelect.append(option);
  }
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

async function readSelectedFile(file) {
  return file.text();
}

segments.forEach((button) => {
  button.addEventListener('click', () => updateMode(button.dataset.mode));
});

htmlFile.addEventListener('change', () => {
  setSelectedUpload(htmlFile.files?.[0] || null);
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
  });
});

dropzone.addEventListener('drop', (event) => {
  const [file] = [...(event.dataTransfer?.files || [])];
  if (!file) return;
  if (!/\.html?$/i.test(file.name)) {
    setStatus('请拖入 HTML 文件', 'error');
    return;
  }
  const transfer = new DataTransfer();
  transfer.items.add(file);
  htmlFile.files = transfer.files;
  setSelectedUpload(file);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    format: formatSelect.value,
    outputName: outputNameInput.value.trim(),
  };

  if (maxEdgeInput.value) {
    payload.maxEdge = Number(maxEdgeInput.value);
  }

  if (mode === 'upload') {
    const file = selectedUpload || htmlFile.files?.[0];
    if (!file) {
      setStatus('请先选择 HTML 文件', 'error');
      return;
    }
    payload.sourceName = file.name;
    payload.htmlContent = await readSelectedFile(file);
  } else {
    if (!exampleSelect.value) {
      setStatus('请先选择示例文件', 'error');
      return;
    }
    payload.exampleName = exampleSelect.value;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setStatus('转换中…', 'busy');
  downloadLink.classList.add('hidden');
  downloadEmpty.classList.remove('hidden');
  downloadEmpty.textContent = '正在生成文件，请稍候。';

  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '转换失败');
    }

    setStatus('转换完成', 'done');
    downloadLink.href = data.outputUrl;
    downloadLink.textContent = `下载 ${data.outputName} · ${formatBytes(data.sizeBytes)}`;
    downloadLink.classList.remove('hidden');
    downloadEmpty.classList.add('hidden');
  } catch (error) {
    setStatus('执行失败', 'error');
    downloadLink.classList.add('hidden');
    downloadEmpty.classList.remove('hidden');
    downloadEmpty.textContent = error instanceof Error ? error.message : '未知错误';
  } finally {
    submitButton.disabled = false;
  }
});

await loadExamples();
updateMode('upload');
