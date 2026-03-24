import { Bot } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  summary: string;
  generatedAt: string;
}

export default function AIDiagnosisCard({ summary, generatedAt }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-5 flex gap-4"
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center">
        <Bot className="w-4 h-4 text-indigo-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">AI Diagnosis</span>
          <span className="text-[10px] text-slate-600 font-mono">HealSparrow Agent</span>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">{summary}</p>
        <p className="text-[10px] text-slate-600 mt-2 font-mono">
          Generated {new Date(generatedAt).toLocaleString()}
        </p>
      </div>
    </motion.div>
  );
}
