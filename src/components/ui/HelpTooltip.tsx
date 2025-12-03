import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Lightbulb } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HelpTooltipProps {
  content: React.ReactNode;
  className?: string;
}

export function HelpTooltip({ content, className }: HelpTooltipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={`h-6 w-6 rounded-full hover:bg-yellow-100 hover:text-yellow-600 text-muted-foreground ${className}`}>
          <Lightbulb className="h-4 w-4" />
          <span className="sr-only">Info</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm p-4 font-normal shadow-lg border-yellow-200 bg-yellow-50/95 backdrop-blur-sm text-black">
        <div className="flex gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
                {content}
            </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

