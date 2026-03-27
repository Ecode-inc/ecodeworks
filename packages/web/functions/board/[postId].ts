export const onRequestGet: PagesFunction = async (context) => {
  const postId = context.params.postId as string

  // Fetch OG meta from API server
  const apiUrl = `https://ecode-internal-api.aws-eb2.workers.dev/board/${postId}`
  const response = await fetch(apiUrl)

  if (response.ok) {
    const html = await response.text()
    return new Response(html, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    })
  }

  // Fallback: return generic OG meta
  return new Response(`<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><title>AI 게시판 - 이코드웍스</title>
<meta property="og:title" content="AI 게시판">
<meta property="og:description" content="AI와 사람이 함께 만드는 게시판">
<meta property="og:type" content="article">
</head><body><script>window.location.replace("/board-view/${postId}")</script></body></html>`, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  })
}
