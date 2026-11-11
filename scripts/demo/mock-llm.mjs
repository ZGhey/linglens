// A local OpenAI-compatible endpoint that streams canned explanations slowly,
// so demo recordings show real token-by-token streaming without a real model.
import { createServer } from 'node:http'

const ANSWERS = {
  zh: {
    hydration:
      '在这篇讲服务端渲染的文章里，hydration（水合）指的是：服务器先把页面渲染成完整的 HTML 发给浏览器，React 加载后不重新渲染，而是把事件处理和状态“接”到这些现成的 HTML 上，让静态页面变得可以交互。',
    dropout:
      '在“Regularization”这一节里，dropout 指的是一种正则化方法：训练时随机让一部分神经元暂时失效，迫使网络学到更冗余、更稳健的特征，从而减轻过拟合；推理时不再丢弃。',
  },
  en: {
    hydration:
      'Here, hydration is the step where React takes the finished HTML the server already sent and attaches event handlers and state to it — making the static page interactive without rendering it again.',
    dropout:
      'In the Regularization section, dropout is a training technique: it randomly switches off some units on each step so the network learns redundant, robust features and overfits less. It is not applied at inference.',
  },
}

const port = Number(process.env.PORT ?? 5299)
createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const prompt = JSON.stringify(JSON.parse(body || '{}').messages ?? [])
    const lang = /中文|Chinese/.test(prompt) ? 'zh' : 'en'
    const term = /dropout/i.test(prompt.match(/Selected term: \\"([^\\"]*)/)?.[1] ?? '') ? 'dropout' : 'hydration'
    const text = ANSWERS[lang][term]
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'access-control-allow-origin': '*',
    })
    const pieces = lang === 'zh' ? text.match(/.{1,2}/gsu) : text.match(/\S+\s*/g)
    let i = 0
    const tick = () => {
      if (i >= pieces.length) {
        res.end('data: [DONE]\n\n')
        return
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: pieces[i++] } }] })}\n\n`)
      setTimeout(tick, 55)
    }
    setTimeout(tick, 700)
  })
}).listen(port, () => console.log(`mock LLM on http://localhost:${port}`))
