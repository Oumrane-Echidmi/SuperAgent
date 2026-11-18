import 'package:flutter/material.dart';
import '../theme.dart';

// Demo fixtures (labelled): node positions follow the website's canvas demo.
const double _w = 1040, _h = 820;

class _Thumb {
  final String label;
  final double w, h;
  const _Thumb(this.label, this.w, this.h);
}

class _Node {
  final String id, kind, text;
  final Rect rect;
  final List<_Thumb> thumbs;
  final String? meta;
  const _Node(this.id, this.kind, this.rect, {this.text = '', this.thumbs = const [], this.meta});
}

const _nodes = [
  _Node('note', 'note', Rect.fromLTWH(16, 55, 170, 130),
      text: 'Two image branches and a motion branch off the same frame. Each keeps its own prompt, so a rewrite re-runs that branch alone.'),
  _Node('img', 'image', Rect.fromLTWH(14, 383, 256, 190), text: '720×405'),
  _Node('p1', 'prompt', Rect.fromLTWH(345, 45, 224, 122),
      text: 'Three variations that hold the palette and the mood, but change the framing: wide, centred, and a tight crop.'),
  _Node('p2', 'prompt', Rect.fromLTWH(345, 335, 224, 102),
      text: 'A warmer pass on the same frame — softer light, lower contrast, more room around the edges.'),
  _Node('p3', 'prompt', Rect.fromLTWH(345, 624, 224, 122),
      text: 'A slow three-second push-in on the same frame, gentle parallax, no camera shake. A clean loop for a page hero.'),
  _Node('g1', 'image-gen', Rect.fromLTWH(746, 13, 256, 262),
      thumbs: [_Thumb('Wide', 106, 60), _Thumb('Centred', 106, 60), _Thumb('Tight crop', 106, 60)], meta: '3'),
  _Node('g2', 'image-gen', Rect.fromLTWH(746, 335, 256, 290),
      thumbs: [_Thumb('Softer light', 106, 60), _Thumb('Vertical cut', 106, 188)], meta: '2'),
  _Node('g3', 'video-gen', Rect.fromLTWH(746, 640, 256, 147),
      text: 'Create video from a prompt, image or video reference.', meta: '1'),
];

class _Edge {
  final String from, to;
  final Color color;
  const _Edge(this.from, this.to, this.color);
}

const _edges = [
  _Edge('p1', 'g1', SA.amber),
  _Edge('img', 'g1', SA.blue),
  _Edge('p2', 'g2', SA.amber),
  _Edge('img', 'p2', SA.blue),
  _Edge('img', 'g2', SA.blue),
  _Edge('p3', 'g3', SA.amber),
  _Edge('img', 'g3', SA.blue),
];

class CanvasScreen extends StatelessWidget {
  const CanvasScreen({super.key});

  @override
  Widget build(BuildContext context) => SAPage(
        title: 'Canvas',
        icon: Icons.palette_outlined,
        actions: const [Pill('Beta', outlined: true), SizedBox(width: 8)],
        body: InteractiveViewer(
          constrained: false,
          minScale: 0.3,
          maxScale: 2.5,
          boundaryMargin: const EdgeInsets.all(200),
          child: SizedBox(
            width: _w,
            height: _h,
            child: Stack(clipBehavior: Clip.none, children: [
              const Positioned.fill(child: CustomPaint(painter: _EdgePainter())),
              for (final n in _nodes)
                Positioned(left: n.rect.left, top: n.rect.top, width: n.rect.width, height: n.rect.height, child: _NodeView(n)),
            ]),
          ),
        ),
      );
}

class _EdgePainter extends CustomPainter {
  const _EdgePainter();
  @override
  void paint(Canvas canvas, Size size) {
    final byId = {for (final n in _nodes) n.id: n};
    for (final e in _edges) {
      final a = byId[e.from]!.rect, b = byId[e.to]!.rect;
      final s = Offset(a.right, a.center.dy);
      final t = Offset(b.left, b.center.dy);
      final dx = (t.dx - s.dx) * .5;
      final path = Path()
        ..moveTo(s.dx, s.dy)
        ..cubicTo(s.dx + dx, s.dy, t.dx - dx, t.dy, t.dx, t.dy);
      canvas.drawPath(
          path,
          Paint()
            ..color = e.color
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.6);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _NodeView extends StatelessWidget {
  final _Node n;
  const _NodeView(this.n);

  Widget _art(double? w, double? h) => Container(
        width: w,
        height: h,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          gradient: const LinearGradient(colors: [SA.pink, SA.amber, SA.green, SA.blue], begin: Alignment.topLeft, end: Alignment.bottomRight),
        ),
      );

  Widget _head(IconData i, String t, Color c) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(children: [Icon(i, size: 11, color: c), const SizedBox(width: 5), Text(t, style: SA.t(10, c: c))]),
      );

  BoxDecoration get _box =>
      BoxDecoration(color: SA.sidebar, borderRadius: BorderRadius.circular(SA.radius + 2), border: Border.all(color: SA.border));

  @override
  Widget build(BuildContext context) {
    switch (n.kind) {
      case 'note':
        return Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: SA.amber.withValues(alpha: .14), borderRadius: BorderRadius.circular(SA.radius + 2)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _head(Icons.sticky_note_2_outlined, 'Notes', SA.muted),
            Text(n.text, style: SA.t(11.5, c: SA.amber, h: 1.4)),
          ]),
        );
      case 'image':
        return Container(
          padding: const EdgeInsets.all(8),
          decoration: _box,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _head(Icons.image_outlined, 'Image', SA.muted),
            Expanded(
              child: Stack(children: [
                Positioned.fill(child: _art(null, null)),
                Positioned(left: 6, bottom: 6, child: Text(n.text, style: SA.t(9, f: SA.fontMono))),
              ]),
            ),
          ]),
        );
      case 'prompt':
        return Container(
          padding: const EdgeInsets.all(8),
          decoration: _box,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _head(Icons.terminal, 'Prompt', SA.muted),
            Expanded(
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: SA.bg, borderRadius: BorderRadius.circular(8)),
                child: Text(n.text, style: SA.t(11.5, w: FontWeight.w600, h: 1.4)),
              ),
            ),
          ]),
        );
      default:
        final video = n.kind == 'video-gen';
        final c = video ? SA.pink : SA.blue;
        return Container(
          padding: const EdgeInsets.all(8),
          decoration: _box,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _head(video ? Icons.videocam_outlined : Icons.image_outlined, video ? 'Generate video' : 'Generate image', c),
            if (video) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: SA.card, borderRadius: BorderRadius.circular(8)),
                child: Text(n.text, style: SA.t(11.5, c: SA.muted, h: 1.4)),
              ),
              const SizedBox(height: 6),
              Text('From connected prompt', style: SA.t(9, c: SA.muted)),
              const Spacer(),
            ] else
              Expanded(
                child: Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final t in n.thumbs)
                    SizedBox(
                      width: t.w,
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        _art(t.w, t.h),
                        const SizedBox(height: 3),
                        Text(t.label, style: SA.t(10, c: SA.muted)),
                      ]),
                    ),
                ]),
              ),
            Text('default model', style: SA.t(9, c: SA.muted, f: SA.fontMono)),
            const SizedBox(height: 2),
            Row(children: [
              const Icon(Icons.layers_outlined, size: 10, color: SA.muted),
              const SizedBox(width: 3),
              Text(n.meta ?? '', style: SA.t(9, c: SA.muted, f: SA.fontMono)),
              const SizedBox(width: 8),
              const Icon(Icons.crop_16_9, size: 10, color: SA.muted),
              const SizedBox(width: 3),
              Text('16:9', style: SA.t(9, c: SA.muted, f: SA.fontMono)),
            ]),
          ]),
        );
    }
  }
}
