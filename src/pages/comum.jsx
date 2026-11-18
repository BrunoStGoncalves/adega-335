import { useCallback, useRef, useState } from 'react'

export function useToast() {
  const [texto, setTexto] = useState('')
  const t = useRef()
  const mostrar = useCallback((msg) => {
    setTexto(msg)
    clearTimeout(t.current)
    t.current = setTimeout(() => setTexto(''), 3000)
  }, [])
  return [texto, mostrar]
}

export const Toast = ({ texto }) => (texto ? <div className="toast" role="status">{texto}</div> : null)

export function Modal({ titulo, aoFechar, children }) {
  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="card modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <div className="topo"><h2>{titulo}</h2><button className="btn claro" onClick={aoFechar}>Fechar</button></div>
        {children}
      </div>
    </div>
  )
}
