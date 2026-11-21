package com.cortanagpt.probe.persona;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Metadata-only catalog for the original Cortana persona PERS assets.
 *
 * The source APK remains immutable. This catalog intentionally contains no
 * extracted image payloads and makes no claim about runtime state transitions.
 */
public final class PersonaAssetCatalog {
    public enum Family { CIRCLE, MIANTUAN }

    public static final class Asset {
        private final String fileName;
        private final Family family;
        private final String expression;
        private final int width;
        private final int height;
        private final int frameCount;
        private final int containerBytes;

        private Asset(String fileName, Family family, String expression,
                      int width, int height, int frameCount, int containerBytes) {
            this.fileName = fileName;
            this.family = family;
            this.expression = expression;
            this.width = width;
            this.height = height;
            this.frameCount = frameCount;
            this.containerBytes = containerBytes;
        }
        public String getFileName() { return fileName; }
        public Family getFamily() { return family; }
        public String getExpression() { return expression; }
        public int getWidth() { return width; }
        public int getHeight() { return height; }
        public int getFrameCount() { return frameCount; }
        public int getContainerBytes() { return containerBytes; }
    }

    private static final List<Asset> ASSETS;
    static {
        List<Asset> assets = new ArrayList<>();
        add(assets, "circle_abashed1-100.pers", Family.CIRCLE, "abashed", 100,116,72,27034);
        add(assets, "circle_alert1-100.pers", Family.CIRCLE, "alert", 214,249,10,44636);
        add(assets, "circle_audio1-100.pers", Family.CIRCLE, "audio", 100,116,7,65687);
        add(assets, "circle_bouncy1-100.pers", Family.CIRCLE, "bouncy", 214,249,34,38635);
        add(assets, "circle_calm1-100.pers", Family.CIRCLE, "calm", 100,116,21,118653);
        add(assets, "circle_considerate1-100.pers", Family.CIRCLE, "considerate", 214,249,12,50018);
        add(assets, "circle_elated1-100.pers", Family.CIRCLE, "elated", 214,249,34,37467);
        add(assets, "circle_greeting1-100.pers", Family.CIRCLE, "greeting", 100,116,40,25251);
        add(assets, "circle_greeting2-100.pers", Family.CIRCLE, "greeting", 100,116,39,24029);
        add(assets, "circle_greeting3-100.pers", Family.CIRCLE, "greeting", 214,249,39,47872);
        add(assets, "circle_greeting4-100.pers", Family.CIRCLE, "greeting", 214,249,37,61511);
        add(assets, "circle_lightning1-100.pers", Family.CIRCLE, "lightning", 428,500,8,11322);
        add(assets, "circle_listening1-100.pers", Family.CIRCLE, "listening", 100,116,10,29269);
        add(assets, "circle_needmore1-100.pers", Family.CIRCLE, "needmore", 214,249,18,151341);
        add(assets, "circle_oobeintro1-100.pers", Family.CIRCLE, "oobeintro", 214,249,100,38404);
        add(assets, "circle_optimistic1-100.pers", Family.CIRCLE, "optimistic", 214,249,9,62918);
        add(assets, "circle_reminder1-100.pers", Family.CIRCLE, "reminder", 214,249,12,43556);
        add(assets, "circle_satisfied1-100.pers", Family.CIRCLE, "satisfied", 214,249,34,33839);
        add(assets, "circle_sensitive1-100.pers", Family.CIRCLE, "sensitive", 214,249,48,37208);
        add(assets, "circle_siri1-100.pers", Family.CIRCLE, "siri", 214,249,63,81410);
        add(assets, "circle_speaking1-100.pers", Family.CIRCLE, "speaking", 100,116,10,51335);
        add(assets, "circle_sunny1-100.pers", Family.CIRCLE, "sunny", 428,500,34,93456);
        add(assets, "circle_thinking1-100.pers", Family.CIRCLE, "thinking", 100,116,28,12910);

        add(assets, "miantuan_abashed1-100.pers", Family.MIANTUAN, "abashed", 214,249,15,49523);
        add(assets, "miantuan_alert1-100.pers", Family.MIANTUAN, "alert", 214,249,1,33383);
        add(assets, "miantuan_audio1-100.pers", Family.MIANTUAN, "audio", 214,249,24,56165);
        add(assets, "miantuan_blink1-100.pers", Family.MIANTUAN, "blink", 214,249,40,29450);
        add(assets, "miantuan_bouncy1-100.pers", Family.MIANTUAN, "bouncy", 214,249,40,41302);
        add(assets, "miantuan_calm1-100.pers", Family.MIANTUAN, "calm", 214,249,40,29531);
        add(assets, "miantuan_considerate1-100.pers", Family.MIANTUAN, "considerate", 214,249,1,55442);
        add(assets, "miantuan_elated1-100.pers", Family.MIANTUAN, "elated", 214,249,40,45667);
        add(assets, "miantuan_greeting1-100.pers", Family.MIANTUAN, "greeting", 214,249,40,26539);
        add(assets, "miantuan_greeting2-100.pers", Family.MIANTUAN, "greeting", 214,249,40,31254);
        add(assets, "miantuan_greeting3-100.pers", Family.MIANTUAN, "greeting", 214,249,40,32178);
        add(assets, "miantuan_heart1-100.pers", Family.MIANTUAN, "heart", 214,249,130,106059);
        add(assets, "miantuan_holiday1-100.pers", Family.MIANTUAN, "holiday", 214,249,140,164928);
        add(assets, "miantuan_listening1-100.pers", Family.MIANTUAN, "listening", 214,249,6,80964);
        add(assets, "miantuan_look1-100.pers", Family.MIANTUAN, "look", 214,249,40,28769);
        add(assets, "miantuan_needmore1-100.pers", Family.MIANTUAN, "needmore", 214,249,15,53159);
        add(assets, "miantuan_oobeintro1-100.pers", Family.MIANTUAN, "oobeintro", 214,249,120,52310);
        add(assets, "miantuan_optimistic1-100.pers", Family.MIANTUAN, "optimistic", 214,249,40,39165);
        add(assets, "miantuan_reminder1-100.pers", Family.MIANTUAN, "reminder", 214,249,40,38790);
        add(assets, "miantuan_satisfied1-100.pers", Family.MIANTUAN, "satisfied", 214,249,40,38174);
        add(assets, "miantuan_sensitive1-100.pers", Family.MIANTUAN, "sensitive", 214,249,15,47261);
        add(assets, "miantuan_siri1-100.pers", Family.MIANTUAN, "siri", 214,249,100,76193);
        add(assets, "miantuan_speaking1-100.pers", Family.MIANTUAN, "speaking", 214,249,40,57070);
        add(assets, "miantuan_thinking1-100.pers", Family.MIANTUAN, "thinking", 214,249,40,71356);
        add(assets, "miantuan_wink1-100.pers", Family.MIANTUAN, "wink", 214,249,40,30203);
        ASSETS = Collections.unmodifiableList(assets);
    }

    private PersonaAssetCatalog() { }

    private static void add(List<Asset> assets, String fileName, Family family,
                            String expression, int width, int height,
                            int frames, int bytes) {
        assets.add(new Asset(fileName, family, expression, width, height, frames, bytes));
    }

    public static List<Asset> all() { return ASSETS; }

    /** Exact, case-sensitive basename lookup. Path components are never accepted. */
    public static Asset findByFileName(String fileName) {
        if (fileName == null || fileName.indexOf('/') >= 0 || fileName.indexOf('\\') >= 0) return null;
        for (Asset asset : ASSETS) {
            if (asset.fileName.equals(fileName)) return asset;
        }
        return null;
    }

    /** Returns every source variant for a family/expression pair, preserving inventory order. */
    public static List<Asset> find(Family family, String expression) {
        if (family == null || expression == null) return Collections.emptyList();
        List<Asset> matches = new ArrayList<>();
        for (Asset asset : ASSETS) {
            if (asset.family == family && asset.expression.equals(expression)) matches.add(asset);
        }
        return Collections.unmodifiableList(matches);
    }

    public static int totalFrames() {
        int total = 0;
        for (Asset asset : ASSETS) total += asset.frameCount;
        return total;
    }

    public static int totalContainerBytes() {
        int total = 0;
        for (Asset asset : ASSETS) total += asset.containerBytes;
        return total;
    }
}
