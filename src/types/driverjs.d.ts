declare module "driver.js" {
  export interface Driver {
    drive(): void;
    destroy(): void;
    isActive(): boolean;
  }

  export interface DriverPopover {
    footerButtons: HTMLElement;
  }

  export interface DriverStep {
    element: string;
    popover?: {
      title?: string;
      description?: string;
      side?: string;
      progressText?: string;
    };
  }

  export interface DriverOptions {
    animate?: boolean;
    smoothScroll?: boolean;
    allowClose?: boolean;
    overlayClickBehavior?: "close" | "stop";
    showProgress?: boolean;
    prevBtnText?: string;
    nextBtnText?: string;
    doneBtnText?: string;
    onPopoverRender?: (popover: DriverPopover) => void;
    onDestroyed?: () => void;
    steps?: DriverStep[];
  }

  export function driver(options?: DriverOptions): Driver;
}
