package com.cortanagpt.probe;

import com.cortanagpt.probe.persona.PersonaAssetCatalog;
import org.junit.Test;
import static org.junit.Assert.*;

public class PersonaAssetCatalogTest {
    @Test public void inventoryMatchesVerifiedPERSCounts() {
        assertEquals(48, PersonaAssetCatalog.all().size());
        assertEquals(1846, PersonaAssetCatalog.totalFrames());
        assertEquals(2502596, PersonaAssetCatalog.totalContainerBytes());
    }

    @Test public void catalogExposesBothPersonaFamilies() {
        int circle = 0;
        int miantuan = 0;
        for (PersonaAssetCatalog.Asset asset : PersonaAssetCatalog.all()) {
            if (asset.getFamily() == PersonaAssetCatalog.Family.CIRCLE) circle++;
            if (asset.getFamily() == PersonaAssetCatalog.Family.MIANTUAN) miantuan++;
        }
        assertEquals(24, circle);
        assertEquals(24, miantuan);
    }

    @Test public void exactLookupPreservesOriginalCanvasAndAnimationMetadata() {
        PersonaAssetCatalog.Asset thinking = PersonaAssetCatalog.findByFileName("circle_thinking1-100.pers");
        assertNotNull(thinking);
        assertEquals(100, thinking.getWidth());
        assertEquals(116, thinking.getHeight());
        assertEquals(28, thinking.getFrameCount());
        assertEquals("thinking", thinking.getExpression());
    }

    @Test public void expressionLookupReturnsAllNumberedVariants() {
        assertEquals(4, PersonaAssetCatalog.find(
                PersonaAssetCatalog.Family.CIRCLE, "greeting").size());
        assertEquals(3, PersonaAssetCatalog.find(
                PersonaAssetCatalog.Family.MIANTUAN, "greeting").size());
    }

    @Test public void lookupRejectsPathTraversalAndUnknownNames() {
        assertNull(PersonaAssetCatalog.findByFileName("../circle_thinking1-100.pers"));
        assertNull(PersonaAssetCatalog.findByFileName("circle_thinking1-100.pers/../../secret"));
        assertNull(PersonaAssetCatalog.findByFileName("unknown.pers"));
        assertTrue(PersonaAssetCatalog.find(null, "thinking").isEmpty());
    }

    @Test public void catalogIsImmutable() {
        try {
            PersonaAssetCatalog.all().clear();
            fail("catalog must be immutable");
        } catch (UnsupportedOperationException expected) { }
        try {
            PersonaAssetCatalog.find(PersonaAssetCatalog.Family.CIRCLE, "greeting").clear();
            fail("query result must be immutable");
        } catch (UnsupportedOperationException expected) { }
    }
}
