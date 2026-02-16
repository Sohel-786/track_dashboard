"use client";

import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

export interface FullScreenImageViewerProps {
    isOpen: boolean;
    onClose: () => void;
    imageSrc: string | null;
    alt?: string;
}

export function FullScreenImageViewer({
    isOpen,
    onClose,
    imageSrc,
    alt = "Image",
}: FullScreenImageViewerProps) {
    if (!imageSrc) return null;

    return (
        <Lightbox
            open={isOpen}
            close={onClose}
            slides={[{ src: imageSrc, alt }]}
            plugins={[Zoom]}
            animation={{ fade: 300, swipe: 200 }}
            zoom={{
                maxZoomPixelRatio: 3,
                zoomInMultiplier: 2,
                doubleTapDelay: 300,
                doubleClickDelay: 300,
                doubleClickMaxStops: 2,
                keyboardMoveDistance: 50,
                wheelZoomDistanceFactor: 100,
                pinchZoomDistanceFactor: 100,
                scrollToZoom: true,
            }}
            controller={{
                closeOnBackdropClick: false,
                closeOnPullUp: false,
                closeOnPullDown: false,
            }}
            styles={{
                container: { backgroundColor: "rgba(0, 0, 0, 0.95)" },
                root: { backdropFilter: "blur(4px)" },
            }}
            render={{
                buttonPrev: () => null,
                buttonNext: () => null,
            }}
        />
    );
}
