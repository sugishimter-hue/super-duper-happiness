// 체험판: [도입 문의하기] → 상담 신청서 작성 → 신청서 복사 → 카카오톡 채널로 보내기
// 입력한 내용은 방문자 화면에만 있고 어디에도 저장되지 않습니다.
(() => {
  const CHANNEL = __CONSULT_URL__; // 카카오톡 채널(또는 상담 페이지) 주소
  const IS_KAKAO = /kakao\.com/.test(CHANNEL);
  const $ = (s, el = document) => el.querySelector(s);
  const dlg = $('#consultModal');
  const form = $('#consultForm');
  const done = $('#consultDone');
  const msgBox = $('#consultMsg');

  $('#consultGo').href = CHANNEL;
  $('#consultGo').textContent = IS_KAKAO ? '② 카카오톡 채널 열기' : '② 상담 창구 열기';
  $('#consultHow').textContent = IS_KAKAO
    ? '신청서를 복사한 뒤 카카오톡 채널을 열어 채팅창에 붙여 넣고 보내 주세요. 확인 후 연락드립니다.'
    : '신청서를 복사한 뒤 상담 창구를 열어 붙여 넣어 주세요. 확인 후 연락드립니다.';

  function open() {
    form.hidden = false;
    done.hidden = true;
    $('#consultErr').textContent = '';
    dlg.showModal();
    $('#cName').focus();
  }
  document.querySelectorAll('[data-consult]').forEach((b) => b.addEventListener('click', open));
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-consult-close]')) dlg.close();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const name = String(f.get('name') || '').trim();
    const contact = String(f.get('contact') || '').trim();
    const interests = f.getAll('interest').map(String);
    if (!name || !contact) return ($('#consultErr').textContent = '이름과 연락처를 적어 주세요.');
    if (!interests.length) return ($('#consultErr').textContent = '관심 분야를 하나 이상 골라 주세요.');
    if (!f.get('agree')) return ($('#consultErr').textContent = '상담을 위한 개인정보 수집·이용에 동의해 주세요.');
    const lines = [
      '[AI 직원 사무실 도입 상담 신청]',
      `이름: ${name}`,
      `연락처: ${contact}`,
      `관심 분야: ${interests.join(', ')}`,
      f.get('biz') ? `하시는 일: ${String(f.get('biz')).trim()}` : '',
      f.get('time') ? `희망 상담 시간: ${String(f.get('time')).trim()}` : '',
      f.get('memo') ? `문의 내용: ${String(f.get('memo')).trim()}` : '',
    ].filter(Boolean);
    msgBox.value = lines.join('\n');
    form.hidden = true;
    done.hidden = false;
    $('#consultCopy').focus();
  });

  $('#consultCopy').addEventListener('click', () => {
    const ok = () => (($('#consultCopied').textContent = '✅ 복사했습니다. 이제 ②를 눌러 붙여 넣어 주세요.'));
    navigator.clipboard?.writeText(msgBox.value).then(ok, () => {
      msgBox.focus();
      msgBox.select();
      $('#consultCopied').textContent = '복사가 막혀 있어요. 위 글이 선택되었으니 길게 눌러(또는 Ctrl+C) 복사해 주세요.';
    }) ?? (msgBox.select(), ($('#consultCopied').textContent = '위 글을 길게 눌러(또는 Ctrl+C) 복사해 주세요.'));
  });
  $('#consultBack').addEventListener('click', () => {
    done.hidden = true;
    form.hidden = false;
  });
})();
