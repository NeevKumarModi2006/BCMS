import { useEffect } from "react";
import {
  CheckCircle,
  Info,
  AlertTriangle,
  XCircle,
  X
} from "lucide-react"; // uses lucide-react (already allowed)

const icons = {
  success: <CheckCircle size={20} />,
  info: <Info size={20} />,
  warn: <AlertTriangle size={20} />,
  error: <XCircle size={20} />,
};

export default function Toast({ message, type = "info", onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast ${type}`}>
      <div className="toast-left">
        <div className="toast-icon">{icons[type] || icons.info}</div>
        <span className="toast-text">{message}</span>
      </div>
      <button className="toast-close" onClick={onClose}>
        <X size={18} />
      </button>
    </div>
  );
}
